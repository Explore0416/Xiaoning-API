package controller

import (
	"encoding/json"
	"sort"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// GetAllModelsMeta 获取模型列表（分页）
func GetAllModelsMeta(c *gin.Context) {

	pageInfo := common.GetPageQuery(c)
	status := c.Query("status")
	syncOfficial := c.Query("sync_official")
	modelsMeta, total, err := model.SearchModels("", "", status, syncOfficial, pageInfo.GetStartIdx(), pageInfo.GetPageSize())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	// 批量填充附加字段，提升列表接口性能
	enrichModels(modelsMeta)

	// 统计供应商计数（全部数据，不受分页影响）
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

// SearchModelsMeta 搜索模型列表
func SearchModelsMeta(c *gin.Context) {

	keyword := c.Query("keyword")
	vendor := c.Query("vendor")
	status := c.Query("status")
	syncOfficial := c.Query("sync_official")
	pageInfo := common.GetPageQuery(c)

	modelsMeta, total, err := model.SearchModels(keyword, vendor, status, syncOfficial, pageInfo.GetStartIdx(), pageInfo.GetPageSize())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	// 批量填充附加字段，提升列表接口性能
	enrichModels(modelsMeta)
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
	enrichModels([]*model.Model{&m})
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
		// 只更新状态，防止误清空其他字段
		if err := model.DB.Model(&model.Model{}).Where("id = ?", m.Id).Update("status", m.Status).Error; err != nil {
			common.ApiError(c, err)
			return
		}
	} else {
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
	if err := model.DB.Delete(&model.Model{}, id).Error; err != nil {
		common.ApiError(c, err)
		return
	}
	model.RefreshPricing()
	common.ApiSuccess(c, nil)
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

	// 1) 拆分精确与规则匹配
	exactNames := make([]string, 0)
	exactIdx := make(map[string][]int) // modelName -> indices in models
	ruleIndices := make([]int, 0)
	for i, m := range models {
		if m == nil {
			continue
		}
		if m.NameRule == model.NameRuleExact {
			exactNames = append(exactNames, m.ModelName)
			exactIdx[m.ModelName] = append(exactIdx[m.ModelName], i)
		} else {
			ruleIndices = append(ruleIndices, i)
		}
	}

	// 2) 批量查询精确模型的绑定渠道
	channelsByModel, _ := model.GetBoundChannelsByModelsMap(exactNames)

	// 3) 精确模型：端点从缓存、渠道批量映射、分组/计费类型从缓存
	for name, indices := range exactIdx {
		chs := channelsByModel[name]
		for _, idx := range indices {
			mm := models[idx]
			if mm.Endpoints == "" {
				eps := model.GetModelSupportEndpointTypes(mm.ModelName)
				if b, err := json.Marshal(eps); err == nil {
					mm.Endpoints = string(b)
				}
			}
			mm.BoundChannels = chs
			mm.EnableGroups = model.GetModelEnableGroups(mm.ModelName)
			mm.QuotaTypes = model.GetModelQuotaTypes(mm.ModelName)
		}
	}

	if len(ruleIndices) == 0 {
		return
	}

	// 4) 一次性读取定价缓存，内存匹配所有规则模型
	pricings := model.GetPricing()

	// 为全部规则模型收集匹配名集合、端点并集、分组并集、配额集合
	matchedNamesByIdx := make(map[int][]string)
	endpointSetByIdx := make(map[int]map[constant.EndpointType]struct{})
	groupSetByIdx := make(map[int]map[string]struct{})
	quotaSetByIdx := make(map[int]map[int]struct{})

	for _, p := range pricings {
		for _, idx := range ruleIndices {
			mm := models[idx]
			var matched bool
			switch mm.NameRule {
			case model.NameRulePrefix:
				matched = strings.HasPrefix(p.ModelName, mm.ModelName)
			case model.NameRuleSuffix:
				matched = strings.HasSuffix(p.ModelName, mm.ModelName)
			case model.NameRuleContains:
				matched = strings.Contains(p.ModelName, mm.ModelName)
			}
			if !matched {
				continue
			}
			matchedNamesByIdx[idx] = append(matchedNamesByIdx[idx], p.ModelName)

			es := endpointSetByIdx[idx]
			if es == nil {
				es = make(map[constant.EndpointType]struct{})
				endpointSetByIdx[idx] = es
			}
			for _, et := range p.SupportedEndpointTypes {
				es[et] = struct{}{}
			}

			gs := groupSetByIdx[idx]
			if gs == nil {
				gs = make(map[string]struct{})
				groupSetByIdx[idx] = gs
			}
			for _, g := range p.EnableGroup {
				gs[g] = struct{}{}
			}

			qs := quotaSetByIdx[idx]
			if qs == nil {
				qs = make(map[int]struct{})
				quotaSetByIdx[idx] = qs
			}
			qs[p.QuotaType] = struct{}{}
		}
	}

	// 5) 汇总所有匹配到的模型名称，批量查询一次渠道
	allMatchedSet := make(map[string]struct{})
	for _, names := range matchedNamesByIdx {
		for _, n := range names {
			allMatchedSet[n] = struct{}{}
		}
	}
	allMatched := make([]string, 0, len(allMatchedSet))
	for n := range allMatchedSet {
		allMatched = append(allMatched, n)
	}
	matchedChannelsByModel, _ := model.GetBoundChannelsByModelsMap(allMatched)

	// 6) 回填每个规则模型的并集信息
	for _, idx := range ruleIndices {
		mm := models[idx]

		// 端点并集 -> 序列化
		if es, ok := endpointSetByIdx[idx]; ok && mm.Endpoints == "" {
			eps := make([]constant.EndpointType, 0, len(es))
			for et := range es {
				eps = append(eps, et)
			}
			if b, err := json.Marshal(eps); err == nil {
				mm.Endpoints = string(b)
			}
		}

		// 分组并集
		if gs, ok := groupSetByIdx[idx]; ok {
			groups := make([]string, 0, len(gs))
			for g := range gs {
				groups = append(groups, g)
			}
			mm.EnableGroups = groups
		}

		// 配额类型集合（保持去重并排序）
		if qs, ok := quotaSetByIdx[idx]; ok {
			arr := make([]int, 0, len(qs))
			for k := range qs {
				arr = append(arr, k)
			}
			sort.Ints(arr)
			mm.QuotaTypes = arr
		}

		// 渠道并集
		names := matchedNamesByIdx[idx]
		channelSet := make(map[string]model.BoundChannel)
		for _, n := range names {
			for _, ch := range matchedChannelsByModel[n] {
				key := ch.Name + "_" + strconv.Itoa(ch.Type)
				channelSet[key] = ch
			}
		}
		if len(channelSet) > 0 {
			chs := make([]model.BoundChannel, 0, len(channelSet))
			for _, ch := range channelSet {
				chs = append(chs, ch)
			}
			mm.BoundChannels = chs
		}

		// 匹配信息
		mm.MatchedModels = names
		mm.MatchedCount = len(names)
	}
}
