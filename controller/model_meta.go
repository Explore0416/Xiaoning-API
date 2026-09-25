package controller

import (
	"net/http"
	"sort"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// GetAllModelsMeta 获取模型列表（分页）
func GetAllModelsMeta(c *gin.Context) {
	listModelsMeta(c, "", "")
}

// SearchModelsMeta 搜索模型列表
func SearchModelsMeta(c *gin.Context) {
	listModelsMeta(c, c.Query("keyword"), c.Query("vendor"))
}

func listModelsMeta(c *gin.Context, keyword, vendor string) {
	squareState := model.ModelSquareState(c.Query("square_state"))
	switch squareState {
	case "", model.ModelSquareVisible, model.ModelSquareUnavailable, model.ModelSquareHidden, model.ModelSquarePartial:
	default:
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "Invalid model square state"})
		return
	}

	pageInfo := common.GetPageQuery(c)
	if squareState != "" && (pageInfo.GetPage() < 1 || pageInfo.GetPageSize() < 1) {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "Invalid pagination"})
		return
	}
	offset, limit := pageInfo.GetStartIdx(), pageInfo.GetPageSize()
	if squareState != "" {
		// Visibility depends on live channels and metadata rules. Filter the
		// enriched candidate set before counting and paginating the results.
		offset, limit = 0, -1
	}
	search := model.SearchModels
	if c.Query("include_channel_models") == "true" {
		search = model.SearchModelsWithChannels
	}
	modelsMeta, total, err := search(keyword, vendor, c.Query("status"), c.Query("sync_official"), offset, limit)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if err := enrichModels(modelsMeta); err != nil {
		common.ApiError(c, err)
		return
	}
	if squareState != "" {
		filtered := make([]*model.Model, 0, len(modelsMeta))
		for _, metadata := range modelsMeta {
			if metadata.SquareState == squareState {
				filtered = append(filtered, metadata)
			}
		}
		total = int64(len(filtered))
		start := len(filtered)
		if pageInfo.GetPage()-1 <= len(filtered)/pageInfo.GetPageSize() {
			start = (pageInfo.GetPage() - 1) * pageInfo.GetPageSize()
		}
		end := min(start+pageInfo.GetPageSize(), len(filtered))
		modelsMeta = filtered[start:end]
	}

	vendorCounts, _ := model.GetVendorModelCounts()
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(modelsMeta)
	common.ApiSuccess(c, gin.H{
		"items":         modelsMeta,
		"total":         total,
		"page":          pageInfo.GetPage(),
		"page_size":     pageInfo.GetPageSize(),
		"vendor_counts": vendorCounts,
	})
}

// GetModelMeta 根据 ID 获取单条模型信息
func GetModelMeta(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	var m model.Model
	if err := model.DB.First(&m, id).Error; err != nil {
		common.ApiError(c, err)
		return
	}
	if err := enrichModels([]*model.Model{&m}); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, &m)
}

// CreateModelMeta 新建模型
func CreateModelMeta(c *gin.Context) {
	var m model.Model
	if err := c.ShouldBindJSON(&m); err != nil {
		common.ApiError(c, err)
		return
	}
	if m.ModelName == "" {
		common.ApiErrorMsg(c, "模型名称不能为空")
		return
	}
	if err := model.ValidateMetadataValues(model.MetadataValues{Endpoints: m.Endpoints, Status: m.Status, NameRule: m.NameRule}); err != nil {
		common.ApiError(c, err)
		return
	}
	// 名称冲突检查
	if dup, err := model.IsModelNameDuplicated(0, m.ModelName); err != nil {
		common.ApiError(c, err)
		return
	} else if dup {
		common.ApiErrorMsg(c, "模型名称已存在")
		return
	}

	if err := m.Insert(); err != nil {
		common.ApiError(c, err)
		return
	}
	model.RefreshPricing()
	m.HasMetadata = m.Id > 0
	common.ApiSuccess(c, &m)
}

// UpdateModelMeta 更新模型
func UpdateModelMeta(c *gin.Context) {
	statusOnly := c.Query("status_only") == "true"

	var m model.Model
	if err := c.ShouldBindJSON(&m); err != nil {
		common.ApiError(c, err)
		return
	}
	if m.Id == 0 {
		common.ApiErrorMsg(c, "缺少模型 ID")
		return
	}

	if statusOnly {
		if m.Status != 0 && m.Status != 1 {
			common.ApiErrorMsg(c, "invalid catalog visibility")
			return
		}
		// 只更新状态，防止误清空其他字段
		if err := model.DB.Model(&model.Model{}).Where("id = ?", m.Id).Update("status", m.Status).Error; err != nil {
			common.ApiError(c, err)
			return
		}
	} else {
		if strings.TrimSpace(m.ModelName) == "" {
			common.ApiErrorMsg(c, "模型名称不能为空")
			return
		}
		if err := model.ValidateMetadataValues(model.MetadataValues{Endpoints: m.Endpoints, Status: m.Status, NameRule: m.NameRule}); err != nil {
			common.ApiError(c, err)
			return
		}
		// 名称冲突检查
		if dup, err := model.IsModelNameDuplicated(m.Id, m.ModelName); err != nil {
			common.ApiError(c, err)
			return
		} else if dup {
			common.ApiErrorMsg(c, "模型名称已存在")
			return
		}

		if err := m.Update(); err != nil {
			common.ApiError(c, err)
			return
		}
	}
	model.RefreshPricing()
	m.HasMetadata = m.Id > 0
	common.ApiSuccess(c, &m)
}

// DeleteModelMeta 删除模型
func DeleteModelMeta(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	removeFromChannels, err := strconv.ParseBool(c.DefaultQuery("remove_from_channels", "false"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	removePricing, err := strconv.ParseBool(c.DefaultQuery("remove_pricing", "false"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if removePricing && c.GetInt("role") != common.RoleRootUser {
		c.JSON(http.StatusForbidden, gin.H{"success": false, "message": "Model pricing is managed by a super administrator."})
		return
	}
	result, err := model.DeleteModelMetadata([]int{id}, removeFromChannels, removePricing)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	recordManageAudit(c, "model.delete", map[string]any{"model_ids": []int{id}, "remove_from_channels": removeFromChannels, "remove_pricing": removePricing, "updated_channels": result.UpdatedChannels})
	common.ApiSuccess(c, result)
}

const maxBatchModels = 500

type batchCreateModelsRequest struct {
	Models []batchCreateModel `json:"models"`
}

type batchCreateModel struct {
	ModelName    string `json:"model_name"`
	Description  string `json:"description"`
	Icon         string `json:"icon"`
	Tags         string `json:"tags"`
	VendorID     int    `json:"vendor_id"`
	Endpoints    string `json:"endpoints"`
	Status       *int   `json:"status"`
	SyncOfficial *int   `json:"sync_official"`
	NameRule     int    `json:"name_rule"`
}

type batchUpdateModelsRequest struct {
	IDs        []int                   `json:"ids"`
	ModelNames []string                `json:"model_names"`
	Patch      batchModelMetadataPatch `json:"patch"`
}

type batchModelMetadataPatch struct {
	Description  *string `json:"description"`
	Icon         *string `json:"icon"`
	Tags         *string `json:"tags"`
	VendorID     *int    `json:"vendor_id"`
	Endpoints    *string `json:"endpoints"`
	Status       *int    `json:"status"`
	SyncOfficial *int    `json:"sync_official"`
	NameRule     *int    `json:"name_rule"`
}
type batchDeleteModelsRequest struct {
	IDs        []int    `json:"ids"`
	ModelNames []string `json:"model_names"`
}

type batchModelSkip struct {
	ModelName string `json:"model_name"`
	Reason    string `json:"reason"`
}

type batchReferencedModel struct {
	ModelName string               `json:"model_name"`
	Channels  []model.BoundChannel `json:"channels"`
}

func BatchCreateModels(c *gin.Context) {
	var request batchCreateModelsRequest
	if err := common.DecodeJson(c.Request.Body, &request); err != nil {
		common.ApiError(c, err)
		return
	}
	if len(request.Models) == 0 || len(request.Models) > maxBatchModels {
		common.ApiErrorMsg(c, "模型数量必须在 1 到 500 之间")
		return
	}

	seen := make(map[string]struct{}, len(request.Models))
	candidates := make([]model.Model, 0, len(request.Models))
	skipped := make([]batchModelSkip, 0)
	for _, rawItem := range request.Models {
		item := model.Model{
			ModelName:    strings.TrimSpace(rawItem.ModelName),
			Description:  rawItem.Description,
			Icon:         rawItem.Icon,
			Tags:         rawItem.Tags,
			VendorID:     rawItem.VendorID,
			Endpoints:    rawItem.Endpoints,
			Status:       1,
			SyncOfficial: 1,
			NameRule:     rawItem.NameRule,
		}
		if rawItem.Status != nil {
			item.Status = *rawItem.Status
		}
		if rawItem.SyncOfficial != nil {
			item.SyncOfficial = *rawItem.SyncOfficial
		}
		if item.ModelName == "" {
			common.ApiErrorMsg(c, "模型名称不能为空")
			return
		}
		if _, exists := seen[item.ModelName]; exists {
			skipped = append(skipped, batchModelSkip{ModelName: item.ModelName, Reason: "请求中存在重复模型名称"})
			continue
		}
		seen[item.ModelName] = struct{}{}
		candidates = append(candidates, item)
	}

	created := make([]model.Model, 0, len(candidates))
	if err := model.DB.Transaction(func(tx *gorm.DB) error {
		names := make([]string, 0, len(candidates))
		for _, item := range candidates {
			names = append(names, item.ModelName)
		}
		var existing []model.Model
		if err := tx.Where("model_name IN ?", names).Find(&existing).Error; err != nil {
			return err
		}
		existingNames := make(map[string]struct{}, len(existing))
		for _, item := range existing {
			existingNames[item.ModelName] = struct{}{}
		}
		now := common.GetTimestamp()
		for _, item := range candidates {
			if _, exists := existingNames[item.ModelName]; exists {
				skipped = append(skipped, batchModelSkip{ModelName: item.ModelName, Reason: "模型名称已存在"})
				continue
			}
			item.CreatedTime = now
			item.UpdatedTime = now
			created = append(created, item)
		}
		if len(created) == 0 {
			return nil
		}
		if err := tx.Create(&created).Error; err != nil {
			return err
		}
		for _, item := range created {
			if err := tx.Model(&model.Model{}).Where("id = ?", item.Id).Updates(map[string]any{
				"status":        item.Status,
				"sync_official": item.SyncOfficial,
			}).Error; err != nil {
				return err
			}
		}
		return nil
	}); err != nil {
		common.ApiError(c, err)
		return
	}
	if len(created) > 0 {
		model.RefreshPricing()
	}
	common.ApiSuccess(c, gin.H{"created": created, "skipped": skipped})
}

func BatchUpdateModels(c *gin.Context) {
	var request batchUpdateModelsRequest
	if err := common.DecodeJson(c.Request.Body, &request); err != nil {
		common.ApiError(c, err)
		return
	}
	if (len(request.IDs) == 0 && len(request.ModelNames) == 0) || (len(request.IDs) > 0 && len(request.ModelNames) > 0) {
		common.ApiErrorMsg(c, "必须提供 ids 或 model_names 其中之一")
		return
	}
	if len(request.IDs) > maxBatchModels || len(request.ModelNames) > maxBatchModels {
		common.ApiErrorMsg(c, "一次最多更新 500 个模型")
		return
	}
	updates := map[string]any{}
	if request.Patch.Description != nil {
		updates["description"] = *request.Patch.Description
	}
	if request.Patch.Icon != nil {
		updates["icon"] = *request.Patch.Icon
	}
	if request.Patch.Tags != nil {
		updates["tags"] = *request.Patch.Tags
	}
	if request.Patch.VendorID != nil {
		updates["vendor_id"] = *request.Patch.VendorID
	}
	if request.Patch.Endpoints != nil {
		updates["endpoints"] = *request.Patch.Endpoints
	}
	if request.Patch.Status != nil {
		updates["status"] = *request.Patch.Status
	}
	if request.Patch.SyncOfficial != nil {
		updates["sync_official"] = *request.Patch.SyncOfficial
	}
	if request.Patch.NameRule != nil {
		updates["name_rule"] = *request.Patch.NameRule
	}
	if len(updates) == 0 {
		common.ApiErrorMsg(c, "至少需要更新一个字段")
		return
	}
	updates["updated_time"] = common.GetTimestamp()

	var modelNames []string
	if len(request.ModelNames) > 0 {
		modelNames = make([]string, 0, len(request.ModelNames))
		for _, name := range request.ModelNames {
			if name = strings.TrimSpace(name); name != "" {
				modelNames = append(modelNames, name)
			}
		}
		if len(modelNames) == 0 {
			common.ApiErrorMsg(c, "模型名称不能为空")
			return
		}
	}
	var updatedRows int64
	if err := model.DB.Transaction(func(tx *gorm.DB) error {
		query := tx.Model(&model.Model{})
		if len(request.IDs) > 0 {
			query = query.Where("id IN ?", request.IDs)
		} else {
			query = query.Where("model_name IN ?", modelNames)
		}
		result := query.Updates(updates)
		if result.Error != nil {
			return result.Error
		}
		updatedRows = result.RowsAffected
		return nil
	}); err != nil {
		common.ApiError(c, err)
		return
	}
	if updatedRows > 0 {
		model.RefreshPricing()
	}
	common.ApiSuccess(c, gin.H{"updated_count": updatedRows})
}

func BatchDeleteModels(c *gin.Context) {
	var request batchDeleteModelsRequest
	if err := common.DecodeJson(c.Request.Body, &request); err != nil {
		common.ApiError(c, err)
		return
	}
	if (len(request.IDs) == 0 && len(request.ModelNames) == 0) || (len(request.IDs) > 0 && len(request.ModelNames) > 0) {
		common.ApiErrorMsg(c, "必须提供 ids 或 model_names 其中之一")
		return
	}
	if len(request.IDs) > maxBatchModels || len(request.ModelNames) > maxBatchModels {
		common.ApiErrorMsg(c, "一次最多删除 500 个模型")
		return
	}

	query := model.DB
	if len(request.IDs) > 0 {
		query = query.Where("id IN ?", request.IDs)
	} else {
		names := make([]string, 0, len(request.ModelNames))
		for _, name := range request.ModelNames {
			if name = strings.TrimSpace(name); name != "" {
				names = append(names, name)
			}
		}
		if len(names) == 0 {
			common.ApiErrorMsg(c, "模型名称不能为空")
			return
		}
		query = query.Where("model_name IN ?", names)
	}
	var models []model.Model
	if err := query.Find(&models).Error; err != nil {
		common.ApiError(c, err)
		return
	}
	if len(models) == 0 {
		common.ApiSuccess(c, gin.H{"deleted": []string{}, "referenced": []batchReferencedModel{}})
		return
	}

	names := make([]string, 0, len(models))
	for _, item := range models {
		names = append(names, item.ModelName)
	}
	channelsByModel, err := model.GetBoundChannelsByModelsMap(names)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if err := model.DB.Transaction(func(tx *gorm.DB) error {
		return tx.Delete(&models).Error
	}); err != nil {
		common.ApiError(c, err)
		return
	}
	model.RefreshPricing()

	referenced := make([]batchReferencedModel, 0)
	for _, name := range names {
		if channels := channelsByModel[name]; len(channels) > 0 {
			referenced = append(referenced, batchReferencedModel{ModelName: name, Channels: channels})
		}
	}
	common.ApiSuccess(c, gin.H{"deleted": names, "referenced": referenced})
}

// enrichModels 批量填充附加信息：端点、渠道、分组、计费类型，避免 N+1 查询
func enrichModels(models []*model.Model) {
	if len(models) == 0 {
		return
	}
	if removePricing && c.GetInt("role") != common.RoleRootUser {
		c.JSON(http.StatusForbidden, gin.H{"success": false, "message": "Model pricing is managed by a super administrator."})
		return
	}
	result, err := model.DeleteModelMetadata([]int{id}, removeFromChannels, removePricing)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	recordManageAudit(c, "model.delete", map[string]any{"model_ids": []int{id}, "remove_from_channels": removeFromChannels, "remove_pricing": removePricing, "updated_channels": result.UpdatedChannels})
	common.ApiSuccess(c, result)
}

func BatchDeleteModelMeta(c *gin.Context) {
	var request struct {
		ModelIDs           []int `json:"model_ids"`
		RemoveFromChannels bool  `json:"remove_from_channels"`
		RemovePricing      bool  `json:"remove_pricing"`
	}
	if err := common.DecodeJson(c.Request.Body, &request); err != nil {
		common.ApiError(c, err)
		return
	}
	if request.RemovePricing && c.GetInt("role") != common.RoleRootUser {
		c.JSON(http.StatusForbidden, gin.H{"success": false, "message": "Model pricing is managed by a super administrator."})
		return
	}
	result, err := model.DeleteModelMetadata(request.ModelIDs, request.RemoveFromChannels, request.RemovePricing)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	recordManageAudit(c, "model.delete_batch", map[string]any{"model_ids": request.ModelIDs, "remove_from_channels": request.RemoveFromChannels, "remove_pricing": request.RemovePricing, "updated_channels": result.UpdatedChannels})
	common.ApiSuccess(c, result)
}

// enrichModels keeps configured endpoints intact and derives connections from
// enabled routes, including hidden or unpriced models absent from the catalog.
func enrichModels(models []*model.Model) error {
	if len(models) == 0 {
		return nil
	}
	configured, err := model.GetConfiguredModelChannels()
	if err != nil {
		return err
	}
	for _, metadata := range models {
		if metadata == nil {
			continue
		}
		metadata.HasMetadata = metadata.Id > 0
		channelIDs := make(map[int]struct{})
		for name, ids := range configured {
			if metadata.MatchesName(name) {
				for _, id := range ids {
					channelIDs[id] = struct{}{}
				}
			}
		}
		metadata.ConfiguredChannelCount = len(channelIDs)
	}
	connections, err := model.GetModelConnections()
	if err != nil {
		return err
	}
	if err := model.FillModelSquareStates(models, configured, connections); err != nil {
		return err
	}
	for _, metadata := range models {
		if metadata == nil {
			continue
		}
		channels := make(map[int]model.BoundChannel)
		groups := make(map[string]bool)
		names := make(map[string]bool)
		endpoints := make(map[string]bool)
		quotas := make(map[int]bool)
		for _, connection := range connections {
			name := connection.Model
			if !metadata.MatchesName(name) {
				continue
			}
			names[name] = true
			groups[connection.Group] = true
			channels[connection.ChannelId] = model.BoundChannel{Name: connection.ChannelName, Type: connection.ChannelType}
			for _, endpoint := range model.GetModelSupportEndpointTypes(name) {
				endpoints[string(endpoint)] = true
			}
			for _, quota := range model.GetModelQuotaTypes(name) {
				quotas[quota] = true
			}
		}
		metadata.BoundChannels = nil
		metadata.EnableGroups = nil
		metadata.SupportedEndpoints = nil
		metadata.QuotaTypes = nil
		metadata.MatchedModels = nil
		for _, channel := range channels {
			metadata.BoundChannels = append(metadata.BoundChannels, channel)
		}
		sort.Slice(metadata.BoundChannels, func(i, j int) bool {
			a, b := metadata.BoundChannels[i], metadata.BoundChannels[j]
			if a.Name == b.Name {
				return a.Type < b.Type
			}
			return a.Name < b.Name
		})
		for group := range groups {
			metadata.EnableGroups = append(metadata.EnableGroups, group)
		}
		for endpoint := range endpoints {
			metadata.SupportedEndpoints = append(metadata.SupportedEndpoints, endpoint)
		}
		for quota := range quotas {
			metadata.QuotaTypes = append(metadata.QuotaTypes, quota)
		}
		sort.Strings(metadata.EnableGroups)
		sort.Strings(metadata.SupportedEndpoints)
		sort.Ints(metadata.QuotaTypes)
		if metadata.NameRule != model.NameRuleExact {
			for name := range names {
				metadata.MatchedModels = append(metadata.MatchedModels, name)
			}
			sort.Strings(metadata.MatchedModels)
			metadata.MatchedCount = len(names)
		}
	}
	return nil
}
