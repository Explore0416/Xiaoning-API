package controller

import (
	"fmt"
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
)

// GetSelfResetCards lists the signed-in user's reset cards.
func GetSelfResetCards(c *gin.Context) {
	userId := c.GetInt("id")
	cards, err := model.GetUserResetCards(userId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	available, err := model.CountAvailableResetCards(userId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{
		"cards":     cards,
		"available": available,
	})
}

// UseResetCard spends one card to reset the user's active subscription quota.
func UseResetCard(c *gin.Context) {
	userId := c.GetInt("id")
	cardId, _ := strconv.Atoi(c.Param("id"))
	if cardId <= 0 {
		common.ApiErrorMsg(c, "无效的重置卡ID")
		return
	}
	result, err := model.UseResetCard(userId, cardId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	model.RecordLog(userId, model.LogTypeSystem, fmt.Sprintf("使用重置卡 #%d 重置了 %d 个订阅配额", result.CardId, result.ResetCount))
	common.ApiSuccess(c, result)
}

// AdminListUserResetCards lists every reset card of a user.
func AdminListUserResetCards(c *gin.Context) {
	userId, _ := strconv.Atoi(c.Param("id"))
	if userId <= 0 {
		common.ApiErrorMsg(c, "无效的用户ID")
		return
	}
	cards, err := model.GetUserResetCards(userId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	available, err := model.CountAvailableResetCards(userId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{
		"cards":     cards,
		"available": available,
	})
}

type AdminCreateResetCardsRequest struct {
	Count     int    `json:"count"`
	ExpiresAt int64  `json:"expires_at"`
	Note      string `json:"note"`
}

// AdminCreateResetCards issues reset cards to a user.
func AdminCreateResetCards(c *gin.Context) {
	userId, _ := strconv.Atoi(c.Param("id"))
	if userId <= 0 {
		common.ApiErrorMsg(c, "无效的用户ID")
		return
	}
	var req AdminCreateResetCardsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiErrorMsg(c, "参数错误")
		return
	}
	if req.Count <= 0 {
		req.Count = 1
	}
	cards, err := model.CreateResetCards(userId, req.Count, req.ExpiresAt, req.Note)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	count := len(cards)
	recordManageAuditFor(c, userId, "subscription.reset_card_grant", map[string]any{
		"target_user_id": userId,
		"count":          count,
		"expires_at":     req.ExpiresAt,
	})
	common.ApiSuccess(c, gin.H{
		"count": count,
	})
}

// AdminRevokeResetCard revokes an unused reset card.
func AdminRevokeResetCard(c *gin.Context) {
	cardId, _ := strconv.Atoi(c.Param("id"))
	if cardId <= 0 {
		common.ApiErrorMsg(c, "无效的重置卡ID")
		return
	}
	if err := model.RevokeResetCard(cardId); err != nil {
		common.ApiError(c, err)
		return
	}
	recordManageAudit(c, "subscription.reset_card_revoke", map[string]any{
		"card_id": cardId,
	})
	common.ApiSuccess(c, nil)
}
