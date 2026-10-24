package controller

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// githubStarRequestTimeout bounds the outbound GitHub API calls.
const githubStarRequestTimeout = 15 * time.Second

type githubStarRepo struct {
	FullName string `json:"full_name"`
}

type githubStarUser struct {
	Login string `json:"login"`
}

// githubStarHTTPClient is a variable so tests can substitute a transport.
var githubStarHTTPClient = &http.Client{Timeout: githubStarRequestTimeout}

func githubStarAPIRequest(ctx context.Context, path string, token string) (*http.Response, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://api.github.com"+path, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	return githubStarHTTPClient.Do(req)
}

// resolveGitHubLogin turns the stored numeric GitHub ID into a login name.
func resolveGitHubLogin(ctx context.Context, githubId string, token string) (string, error) {
	res, err := githubStarAPIRequest(ctx, "/user/"+githubId, token)
	if err != nil {
		return "", err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return "", fmt.Errorf("github user lookup failed: status %d", res.StatusCode)
	}
	var user githubStarUser
	if err := common.DecodeJson(res.Body, &user); err != nil {
		return "", err
	}
	if user.Login == "" {
		return "", errors.New("github user lookup failed: empty login")
	}
	return user.Login, nil
}

// userStarredRepo reports whether the public account has starred repo.
// GitHub lists at most 100 starred repositories per page.
func userStarredRepo(ctx context.Context, username string, repo string, token string) (bool, error) {
	for page := 1; page <= 5; page++ {
		res, err := githubStarAPIRequest(ctx, fmt.Sprintf("/users/%s/starred?per_page=100&page=%d", username, page), token)
		if err != nil {
			return false, err
		}
		if res.StatusCode == http.StatusNotFound {
			res.Body.Close()
			return false, errors.New("GitHub user not found")
		}
		if res.StatusCode != http.StatusOK {
			res.Body.Close()
			return false, fmt.Errorf("github starred lookup failed: status %d", res.StatusCode)
		}
		var repos []githubStarRepo
		decodeErr := common.DecodeJson(res.Body, &repos)
		res.Body.Close()
		if decodeErr != nil {
			return false, decodeErr
		}
		for _, item := range repos {
			if strings.EqualFold(item.FullName, repo) {
				return true, nil
			}
		}
		if len(repos) < 100 {
			return false, nil
		}
	}
	return false, nil
}

// GetGitHubStarTaskStatus 返回 GitHub Star 任务配置与当前用户的领取状态
func GetGitHubStarTaskStatus(c *gin.Context) {
	setting := operation_setting.GetGitHubStarSetting()
	userId := c.GetInt("id")

	data := gin.H{
		"enabled":          setting.Enabled,
		"repo":             setting.Repo,
		"reward_type":      setting.EffectiveRewardType(),
		"quota":            setting.Quota,
		"reset_card_count": setting.ResetCardCount,
		"claimed":          false,
	}

	if reward, err := model.GetGitHubStarReward(userId); err == nil {
		data["claimed"] = true
		data["claimed_at"] = reward.CreatedAt
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		common.ApiError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "data": data})
}

// ClaimGitHubStarReward 校验用户是否已给配置的仓库点 Star，并发放一次性奖励
func ClaimGitHubStarReward(c *gin.Context) {
	setting := operation_setting.GetGitHubStarSetting()
	if !setting.Enabled {
		common.ApiErrorT(c, "GitHub star task is not enabled")
		return
	}
	owner, name, ok := setting.RepoOwnerAndName()
	if !ok {
		common.ApiErrorT(c, "GitHub repository is not configured correctly")
		return
	}
	userId := c.GetInt("id")

	if _, err := model.GetGitHubStarReward(userId); err == nil {
		common.ApiErrorT(c, "You have already claimed this reward")
		return
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		common.ApiError(c, err)
		return
	}

	var req struct {
		GitHubUsername string `json:"github_username"`
	}
	_ = c.ShouldBindJSON(&req)

	username := strings.TrimSpace(req.GitHubUsername)
	if username == "" {
		user, err := model.GetUserById(userId, false)
		if err != nil {
			common.ApiError(c, err)
			return
		}
		if user.GitHubId == "" {
			common.ApiErrorT(c, "Please enter your GitHub username")
			return
		}
		username, err = resolveGitHubLogin(c.Request.Context(), user.GitHubId, setting.Token)
		if err != nil {
			logger.LogError(c.Request.Context(), common.LogText("[GitHub-Star] resolve login failed: %s", err.Error()))
			common.ApiErrorT(c, "Failed to query GitHub account, please enter your GitHub username")
			return
		}
	}

	repo := owner + "/" + name
	starred, err := userStarredRepo(c.Request.Context(), username, repo, setting.Token)
	if err != nil {
		logger.LogError(c.Request.Context(), common.LogText("[GitHub-Star] starred lookup failed: %s", err.Error()))
		common.ApiErrorT(c, "Failed to verify GitHub star, please try again later")
		return
	}
	if !starred {
		common.ApiErrorT(c, "You have not starred this repository yet")
		return
	}

	rewardType := setting.EffectiveRewardType()
	quota := 0
	resetCardCount := 0
	if rewardType == model.GitHubStarRewardTypeResetCard {
		resetCardCount = setting.ResetCardCount
	} else {
		quota = setting.Quota
	}
	reward, err := model.GrantGitHubStarReward(userId, username, repo, rewardType, quota, resetCardCount)
	if err != nil {
		if errors.Is(err, gorm.ErrDuplicatedKey) {
			common.ApiErrorT(c, "You have already claimed this reward")
			return
		}
		common.ApiError(c, err)
		return
	}

	if rewardType == model.GitHubStarRewardTypeResetCard {
		model.RecordLog(userId, model.LogTypeSystem, common.NewMessage("Received {{count}} reset cards for starring the GitHub repository", map[string]any{"count": resetCardCount}))
	} else {
		model.RecordLog(userId, model.LogTypeSystem, common.NewMessage("Received {{quota}} for starring the GitHub repository", map[string]any{"quota": logger.FormatQuota(quota)}))
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "Reward claimed successfully",
		"data": gin.H{
			"reward_type":      reward.RewardType,
			"quota":            reward.Quota,
			"reset_card_count": reward.ResetCardCount,
		},
	})
}
