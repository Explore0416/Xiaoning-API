package controller

import (
	"net/http"
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
)

func GetAllInviteCodes(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	startIdx := pageInfo.GetStartIdx()
	pageSize := pageInfo.GetPageSize()

	codes, total, err := model.GetAllInviteCodes(startIdx, pageSize)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    codes,
		"total":   total,
	})
}

func SearchInviteCodes(c *gin.Context) {
	keyword := c.Query("keyword")
	status := c.Query("status")
	pageInfo := common.GetPageQuery(c)
	startIdx := pageInfo.GetStartIdx()
	pageSize := pageInfo.GetPageSize()

	codes, total, err := model.SearchInviteCodes(keyword, status, startIdx, pageSize)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    codes,
		"total":   total,
	})
}

type GenerateInviteCodeRequest struct {
	Count       int   `json:"count" binding:"required"`
	Quota       int   `json:"quota"`
	MaxUseCount int   `json:"max_use_count"`
	ExpiredTime int64 `json:"expired_time"`
}

func GenerateInviteCodes(c *gin.Context) {
	var req GenerateInviteCodeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiErrorI18n(c, i18n.MsgInvalidParams)
		return
	}

	codes, err := model.GenerateInviteCodes(req.Count, req.Quota, req.MaxUseCount, req.ExpiredTime, c.GetInt("id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}

	recordManageAudit(c, "invite_code.generate", map[string]interface{}{
		"count": req.Count,
		"quota": logger.LogQuota(req.Quota),
	})

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    codes,
	})
}

func GetInviteCode(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	if id <= 0 {
		common.ApiErrorMsg(c, "无效的ID")
		return
	}
	code, err := model.GetInviteCodeById(id)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, code)
}

type UpdateInviteCodeRequest struct {
	Id          int   `json:"id"`
	Quota       int   `json:"quota"`
	MaxUseCount int   `json:"max_use_count"`
	ExpiredTime int64 `json:"expired_time"`
	Status      int   `json:"status"`
}

// UpdateInviteCode updates an invite code. With ?status_only=true only the
// status changes; otherwise quota, max_use_count and expired_time are applied.
func UpdateInviteCode(c *gin.Context) {
	var req UpdateInviteCodeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiErrorI18n(c, i18n.MsgInvalidParams)
		return
	}
	if req.Id <= 0 {
		common.ApiErrorMsg(c, "无效的ID")
		return
	}

	updates := map[string]any{}
	if c.Query("status_only") == "true" {
		if req.Status != common.InviteCodeStatusEnabled && req.Status != common.InviteCodeStatusDisabled {
			common.ApiErrorMsg(c, "参数错误")
			return
		}
		updates["status"] = req.Status
	} else {
		if req.Quota < 0 || req.MaxUseCount < 0 || req.ExpiredTime < 0 {
			common.ApiErrorMsg(c, "参数错误")
			return
		}
		updates["quota"] = req.Quota
		updates["max_use_count"] = req.MaxUseCount
		updates["expired_time"] = req.ExpiredTime
	}

	code, err := model.UpdateInviteCodeFields(req.Id, updates)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	recordManageAudit(c, "invite_code.update", map[string]interface{}{
		"id":          req.Id,
		"status_only": c.Query("status_only") == "true",
	})
	common.ApiSuccess(c, code)
}

func DeleteInviteCode(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	err := model.DeleteInviteCodeById(id)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
	})
}

func DeleteExpiredInviteCodes(c *gin.Context) {
	count, err := model.DeleteExpiredOrExhaustedInviteCodes()
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    count,
	})
}
