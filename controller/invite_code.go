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
	page, _ := strconv.Atoi(c.Query("page"))
	pageSize, _ := strconv.Atoi(c.Query("page_size"))
	if pageSize < 1 {
		pageSize = 10
	}
	if pageSize > 100 {
		pageSize = 100
	}
	if page < 1 {
		page = 1
	}
	startIdx := (page - 1) * pageSize

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
	page, _ := strconv.Atoi(c.Query("page"))
	pageSize, _ := strconv.Atoi(c.Query("page_size"))
	if pageSize < 1 {
		pageSize = 10
	}
	if pageSize > 100 {
		pageSize = 100
	}
	if page < 1 {
		page = 1
	}
	startIdx := (page - 1) * pageSize

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
