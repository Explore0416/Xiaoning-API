package model

import (
	"errors"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
)

const (
	GitHubStarRewardTypeQuota     = "quota"
	GitHubStarRewardTypeResetCard = "reset_card"
)

// GitHubStarReward records the one-time reward a user received for starring
// the configured GitHub repository.
type GitHubStarReward struct {
	Id             int    `json:"id" gorm:"primaryKey;autoIncrement"`
	UserId         int    `json:"user_id" gorm:"uniqueIndex;not null"`
	GitHubUsername string `json:"github_username" gorm:"type:varchar(100);not null"`
	Repo           string `json:"repo" gorm:"type:varchar(160);not null"`
	RewardType     string `json:"reward_type" gorm:"type:varchar(16);not null"`
	Quota          int    `json:"quota" gorm:"bigint;default:0"`
	ResetCardCount int    `json:"reset_card_count" gorm:"default:0"`
	CreatedAt      int64  `json:"created_at" gorm:"bigint"`
}

func (r *GitHubStarReward) BeforeCreate(tx *gorm.DB) error {
	r.CreatedAt = common.GetTimestamp()
	return nil
}

// GetGitHubStarReward returns the user's claim record, or gorm.ErrRecordNotFound
// when the user has not claimed the reward yet.
func GetGitHubStarReward(userId int) (*GitHubStarReward, error) {
	var reward GitHubStarReward
	if err := DB.Where("user_id = ?", userId).First(&reward).Error; err != nil {
		return nil, err
	}
	return &reward, nil
}

// GrantGitHubStarReward records the claim and grants the reward in one
// transaction. The unique user index rejects a concurrent second claim, so the
// reward cannot be granted twice.
func GrantGitHubStarReward(userId int, username string, repo string, rewardType string, quota int, resetCardCount int) (*GitHubStarReward, error) {
	if userId <= 0 || username == "" || repo == "" {
		return nil, errors.New("参数错误")
	}
	if rewardType == GitHubStarRewardTypeResetCard {
		if resetCardCount <= 0 || resetCardCount > 1000 {
			return nil, errors.New("重置卡数量应在 1-1000 之间")
		}
	} else {
		if quota <= 0 {
			return nil, errors.New("奖励额度必须大于 0")
		}
		rewardType = GitHubStarRewardTypeQuota
	}

	reward := &GitHubStarReward{
		UserId:         userId,
		GitHubUsername: username,
		Repo:           repo,
		RewardType:     rewardType,
		Quota:          quota,
		ResetCardCount: resetCardCount,
	}
	err := DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(reward).Error; err != nil {
			return err
		}
		if rewardType == GitHubStarRewardTypeResetCard {
			return createResetCardsTx(tx, userId, resetCardCount, ResetCardSourceGitHubStar, "GitHub star reward: "+repo)
		}
		return creditTopUpQuota(tx, userId, quota, nil)
	})
	if err != nil {
		return nil, err
	}
	if rewardType != GitHubStarRewardTypeResetCard {
		syncCreditUserQuotaCache(userId, quota, common.LogText("github star reward"))
	}
	return reward, nil
}
