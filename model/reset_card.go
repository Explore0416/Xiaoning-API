package model

import (
	"errors"

	"github.com/QuantumNous/new-api/common"

	"gorm.io/gorm"
)

const (
	ResetCardStatusAvailable = "available"
	ResetCardStatusUsed      = "used"
	ResetCardStatusRevoked   = "revoked"

	ResetCardSourceAdmin = "admin"
)

// ResetCard grants its owner one manual reset of their active subscription quota.
type ResetCard struct {
	Id     int    `json:"id"`
	UserId int    `json:"user_id" gorm:"index"`
	Status string `json:"status" gorm:"type:varchar(16);index;default:'available'"` // available/used/revoked
	Source string `json:"source" gorm:"type:varchar(32);default:'admin'"`
	Note   string `json:"note" gorm:"type:varchar(255);default:''"`

	ExpiresAt int64 `json:"expires_at" gorm:"bigint;default:0"` // 0 = never expires
	UsedAt    int64 `json:"used_at" gorm:"bigint;default:0"`

	CreatedAt int64 `json:"created_at" gorm:"bigint"`
	UpdatedAt int64 `json:"updated_at" gorm:"bigint"`
}

func (c *ResetCard) BeforeCreate(tx *gorm.DB) error {
	now := common.GetTimestamp()
	c.CreatedAt = now
	c.UpdatedAt = now
	if c.Status == "" {
		c.Status = ResetCardStatusAvailable
	}
	if c.Source == "" {
		c.Source = ResetCardSourceAdmin
	}
	return nil
}

func (c *ResetCard) BeforeUpdate(tx *gorm.DB) error {
	c.UpdatedAt = common.GetTimestamp()
	return nil
}

// CreateResetCards issues count cards to a user. expiresAt = 0 means never expires.
func CreateResetCards(userId int, count int, expiresAt int64, note string) ([]ResetCard, error) {
	if userId <= 0 {
		return nil, errors.New("无效的用户ID")
	}
	if count <= 0 || count > 1000 {
		return nil, errors.New("发放数量应在 1-1000 之间")
	}
	if expiresAt > 0 && expiresAt < common.GetTimestamp() {
		return nil, errors.New("过期时间不能早于当前时间")
	}
	cards := make([]ResetCard, 0, count)
	for range count {
		cards = append(cards, ResetCard{
			UserId:    userId,
			Status:    ResetCardStatusAvailable,
			Source:    ResetCardSourceAdmin,
			Note:      note,
			ExpiresAt: expiresAt,
		})
	}
	if err := DB.Create(&cards).Error; err != nil {
		return nil, err
	}
	return cards, nil
}

// GetUserResetCards returns every card of a user, newest first.
func GetUserResetCards(userId int) ([]ResetCard, error) {
	var cards []ResetCard
	err := DB.Where("user_id = ?", userId).Order("id desc").Find(&cards).Error
	return cards, err
}

// CountAvailableResetCards counts usable cards (unused, unrevoked, unexpired).
func CountAvailableResetCards(userId int) (int64, error) {
	var count int64
	now := common.GetTimestamp()
	err := DB.Model(&ResetCard{}).
		Where("user_id = ? AND status = ? AND (expires_at = 0 OR expires_at > ?)", userId, ResetCardStatusAvailable, now).
		Count(&count).Error
	return count, err
}

// RevokeResetCard disables an unused card. Used cards are left untouched.
func RevokeResetCard(cardId int) error {
	if cardId <= 0 {
		return errors.New("无效的重置卡ID")
	}
	result := DB.Model(&ResetCard{}).
		Where("id = ? AND status = ?", cardId, ResetCardStatusAvailable).
		Update("status", ResetCardStatusRevoked)
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return errors.New("该重置卡不存在或已被使用")
	}
	return nil
}

type ResetCardUseResult struct {
	CardId          int   `json:"card_id"`
	ResetCount      int   `json:"reset_count"`
	SubscriptionIds []int `json:"subscription_ids"`
}

// UseResetCard spends one card and resets the owner's active subscription quota.
// The card is marked used inside the same transaction, so a concurrent double
// click cannot spend two cards for one reset.
func UseResetCard(userId int, cardId int) (*ResetCardUseResult, error) {
	if userId <= 0 || cardId <= 0 {
		return nil, errors.New("参数错误")
	}
	result := &ResetCardUseResult{CardId: cardId, SubscriptionIds: []int{}}
	now := GetDBTimestamp()
	err := DB.Transaction(func(tx *gorm.DB) error {
		var card ResetCard
		if err := lockForUpdate(tx).Where("id = ? AND user_id = ?", cardId, userId).First(&card).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return errors.New("重置卡不存在")
			}
			return err
		}
		if card.Status != ResetCardStatusAvailable {
			return errors.New("该重置卡已被使用或已作废")
		}
		if card.ExpiresAt > 0 && card.ExpiresAt <= now {
			return errors.New("该重置卡已过期")
		}

		var subs []UserSubscription
		if err := lockForUpdate(tx).
			Where("user_id = ? AND status = ? AND end_time > ?", userId, "active", now).
			Order("end_time asc, id asc").
			Find(&subs).Error; err != nil {
			return err
		}
		if len(subs) == 0 {
			return errors.New("当前没有可重置的订阅")
		}
		for i := range subs {
			plan, err := getSubscriptionPlanByIdTx(tx, subs[i].PlanId)
			if err != nil {
				return err
			}
			if err := resetUserSubscriptionTx(tx, &subs[i], plan, now, true); err != nil {
				return err
			}
			result.SubscriptionIds = append(result.SubscriptionIds, subs[i].Id)
		}

		if err := tx.Model(&ResetCard{}).
			Where("id = ? AND status = ?", card.Id, ResetCardStatusAvailable).
			Updates(map[string]any{
				"status":  ResetCardStatusUsed,
				"used_at": now,
			}).Error; err != nil {
			return err
		}
		result.ResetCount = len(subs)
		return nil
	})
	if err != nil {
		return nil, err
	}
	return result, nil
}
