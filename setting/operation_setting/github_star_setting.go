package operation_setting

import (
	"strings"

	"github.com/QuantumNous/new-api/setting/config"
)

const (
	GitHubStarRewardTypeQuota     = "quota"
	GitHubStarRewardTypeResetCard = "reset_card"
)

// GitHubStarSetting 任务中心「给 GitHub 仓库点 Star 领奖励」配置
type GitHubStarSetting struct {
	Enabled        bool   `json:"enabled"`          // 是否启用该任务
	Repo           string `json:"repo"`             // 仓库，格式 owner/repo
	RewardType     string `json:"reward_type"`      // quota / reset_card
	Quota          int    `json:"quota"`            // 奖励额度（RewardType 为 quota 时生效）
	ResetCardCount int    `json:"reset_card_count"` // 奖励重置卡数量（RewardType 为 reset_card 时生效）
	Token          string `json:"token"`            // 管理员 GitHub Token，用于调用 GitHub API 校验 Star
}

var githubStarSetting = GitHubStarSetting{
	Enabled:        false,
	RewardType:     GitHubStarRewardTypeQuota,
	Quota:          10000,
	ResetCardCount: 1,
}

func init() {
	config.GlobalConfig.Register("github_star_setting", &githubStarSetting)
}

// GetGitHubStarSetting 获取 GitHub Star 任务配置
func GetGitHubStarSetting() *GitHubStarSetting {
	return &githubStarSetting
}

// EffectiveRewardType 返回规范化后的奖励类型
func (s *GitHubStarSetting) EffectiveRewardType() string {
	if s.RewardType == GitHubStarRewardTypeResetCard {
		return GitHubStarRewardTypeResetCard
	}
	return GitHubStarRewardTypeQuota
}

// RepoOwnerAndName 解析 owner/repo，格式不合法时返回 false
func (s *GitHubStarSetting) RepoOwnerAndName() (string, string, bool) {
	owner, name, ok := strings.Cut(strings.TrimSpace(s.Repo), "/")
	owner = strings.TrimSpace(owner)
	name = strings.TrimSpace(name)
	if !ok || owner == "" || name == "" || strings.Contains(name, "/") {
		return "", "", false
	}
	return owner, name, true
}
