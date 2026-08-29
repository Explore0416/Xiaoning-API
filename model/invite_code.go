package model

import (
	"errors"
	"fmt"
	"strings"

	"github.com/QuantumNous/new-api/common"

	"gorm.io/gorm"
)

type InviteCode struct {
	Id              int            `json:"id"`
	Code            string         `json:"code" gorm:"type:char(32);uniqueIndex"`
	CreatedByUserId int            `json:"created_by_user_id"`
	Quota           int            `json:"quota" gorm:"default:0"` // 0 = threshold-only, >0 = includes quota
	Status          int            `json:"status" gorm:"default:1"`
	MaxUseCount     int            `json:"max_use_count" gorm:"default:0"` // 0 = unlimited
	UsedCount       int            `json:"used_count" gorm:"default:0"`
	ExpiredTime     int64          `json:"expired_time" gorm:"bigint;default:0"` // 0 = never expires
	CreatedTime     int64          `json:"created_time" gorm:"bigint"`
	DeletedAt       gorm.DeletedAt `gorm:"index"`
}

func GetAllInviteCodes(startIdx int, num int) (codes []*InviteCode, total int64, err error) {
	tx := DB.Begin()
	if tx.Error != nil {
		return nil, 0, tx.Error
	}
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	err = tx.Model(&InviteCode{}).Count(&total).Error
	if err != nil {
		tx.Rollback()
		return nil, 0, err
	}
	err = tx.Order("id desc").Limit(num).Offset(startIdx).Find(&codes).Error
	if err != nil {
		tx.Rollback()
		return nil, 0, err
	}
	if err = tx.Commit().Error; err != nil {
		return nil, 0, err
	}
	return codes, total, nil
}

func SearchInviteCodes(keyword string, status string, startIdx int, num int) (codes []*InviteCode, total int64, err error) {
	query := DB.Model(&InviteCode{})
	if keyword != "" {
		query = query.Where("code LIKE ?", "%"+keyword+"%")
	}
	switch status {
	case "enabled":
		query = query.Where("status = ?", common.InviteCodeStatusEnabled)
	case "disabled":
		query = query.Where("status = ?", common.InviteCodeStatusDisabled)
	case "exhausted":
		query = query.Where("status = ?", common.InviteCodeStatusExhausted)
	case "expired":
		query = query.Where("expired_time != 0 AND expired_time < ?", common.GetTimestamp())
	}

	err = query.Count(&total).Error
	if err != nil {
		return nil, 0, err
	}
	err = query.Order("id desc").Limit(num).Offset(startIdx).Find(&codes).Error
	return codes, total, err
}

func GetInviteCodeById(id int) (*InviteCode, error) {
	var code InviteCode
	err := DB.First(&code, "id = ?", id).Error
	return &code, err
}

func GetInviteCodeByCode(code string) (*InviteCode, error) {
	var ic InviteCode
	err := DB.First(&ic, "code = ?", code).Error
	return &ic, err
}

// RedeemInviteCode atomically consumes an invite code.
// If the code has quota > 0, the quota is returned for the caller to apply.
// Returns (quota, error) where quota is the amount to credit to the new user.
func RedeemInviteCode(code string) (quota int, err error) {
	if code == "" {
		return 0, errors.New("未提供邀请码")
	}

	ic := &InviteCode{}
	common.RandomSleep()
	err = DB.Transaction(func(tx *gorm.DB) error {
		err := lockForUpdate(tx).Where("code = ?", code).First(ic).Error
		if err != nil {
			return errors.New("无效的邀请码")
		}
		if ic.Status != common.InviteCodeStatusEnabled {
			return errors.New("该邀请码已失效")
		}
		if ic.ExpiredTime != 0 && ic.ExpiredTime < common.GetTimestamp() {
			return errors.New("该邀请码已过期")
		}
		if ic.MaxUseCount > 0 && ic.UsedCount >= ic.MaxUseCount {
			return errors.New("该邀请码已用完")
		}

		updates := map[string]interface{}{
			"used_count": ic.UsedCount + 1,
		}
		// Exhaust the code when max_use_count is reached (only if max_use_count > 0)
		if ic.MaxUseCount > 0 && ic.UsedCount+1 >= ic.MaxUseCount {
			updates["status"] = common.InviteCodeStatusExhausted
		}

		where := `id = ? AND status = ?`
		args := []interface{}{ic.Id, common.InviteCodeStatusEnabled}
		if ic.MaxUseCount > 0 {
			where += ` AND used_count < ?`
			args = append(args, ic.MaxUseCount)
		}

		result := tx.Model(&InviteCode{}).Where(where, args...).Updates(updates)
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected == 0 {
			return errors.New("该邀请码已被使用")
		}
		return nil
	})
	if err != nil {
		common.SysError("invite code redeem failed: " + err.Error())
		return 0, err
	}
	return ic.Quota, nil
}

func (ic *InviteCode) Insert() error {
	var err error
	err = DB.Create(ic).Error
	return err
}

func (ic *InviteCode) Update() error {
	return DB.Model(ic).Select("quota", "status", "max_use_count", "expired_time").Updates(ic).Error
}

func (ic *InviteCode) Delete() error {
	return DB.Delete(ic).Error
}

func DeleteInviteCodeById(id int) (err error) {
	if id == 0 {
		return errors.New("id 为空！")
	}
	ic := InviteCode{Id: id}
	err = DB.Where(ic).First(&ic).Error
	if err != nil {
		return err
	}
	return ic.Delete()
}

// GenerateInviteCodes creates a batch of invite codes.
// count: how many codes to generate
// quota: quota each code carries (0 = threshold-only)
// maxUseCount: max uses per code (0 = unlimited)
// expiredTime: expiration timestamp (0 = never)
// createdByUserId: who created these codes
func GenerateInviteCodes(count int, quota int, maxUseCount int, expiredTime int64, createdByUserId int) ([]string, error) {
	if count <= 0 || count > 1000 {
		return nil, fmt.Errorf("生成数量应在 1-1000 之间")
	}

	now := common.GetTimestamp()
	codes := make([]string, 0, count)
	items := make([]InviteCode, 0, count)

	for i := 0; i < count; i++ {
		code := strings.ToUpper(common.GetRandomString(8))
		items = append(items, InviteCode{
			Code:            code,
			CreatedByUserId: createdByUserId,
			Quota:           quota,
			Status:          common.InviteCodeStatusEnabled,
			MaxUseCount:     maxUseCount,
			UsedCount:       0,
			ExpiredTime:     expiredTime,
			CreatedTime:     now,
		})
		codes = append(codes, code)
	}

	if err := DB.Create(&items).Error; err != nil {
		return nil, err
	}
	return codes, nil
}

// DeleteExpiredOrExhaustedInviteCodes cleans up codes that are expired or fully used.
func DeleteExpiredOrExhaustedInviteCodes() (int64, error) {
	now := common.GetTimestamp()
	result := DB.Where("status = ? OR (expired_time != 0 AND expired_time < ?)", common.InviteCodeStatusExhausted, now).Delete(&InviteCode{})
	return result.RowsAffected, result.Error
}
