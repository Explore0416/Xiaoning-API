package controller

import (
	"fmt"
	"math"
	"net/http"
	"regexp"
	"sort"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/gin-gonic/gin"
)

const maxRatioBatchRules = 100
const maxRatioBatchPatternLength = 256

type RatioBatchRequest struct {
	Rules        []RatioBatchRule `json:"rules"`
	TargetModels []string         `json:"target_models"`
}

type PricingModelValues struct {
	ModelRatio           *float64 `json:"model_ratio,omitempty"`
	CompletionRatio      *float64 `json:"completion_ratio,omitempty"`
	CacheRatio           *float64 `json:"cache_ratio,omitempty"`
	CreateCacheRatio     *float64 `json:"create_cache_ratio,omitempty"`
	ImageRatio           *float64 `json:"image_ratio,omitempty"`
	AudioRatio           *float64 `json:"audio_ratio,omitempty"`
	AudioCompletionRatio *float64 `json:"audio_completion_ratio,omitempty"`
	ModelPrice           *float64 `json:"model_price,omitempty"`
}

type PricingModelInventoryItem struct {
	ModelName string               `json:"model_name"`
	Sources   []string             `json:"sources"`
	Metadata  *model.Model         `json:"metadata,omitempty"`
	Pricing   PricingModelValues   `json:"pricing"`
	Channels  []model.BoundChannel `json:"channels"`
}

type RatioBatchRule struct {
	Field string          `json:"field"`
	Match RatioBatchMatch `json:"match"`
	Op    RatioBatchOp    `json:"op"`
}

type RatioBatchMatch struct {
	Type    string `json:"type"`
	Pattern string `json:"pattern"`
}

type RatioBatchOp struct {
	Type  string  `json:"type"`
	Value float64 `json:"value"`
}

type RatioBatchChange struct {
	Field string  `json:"field"`
	Model string  `json:"model"`
	Old   float64 `json:"old"`
	New   float64 `json:"new"`
}

type RatioBatchError struct {
	Field   string `json:"field,omitempty"`
	Model   string `json:"model,omitempty"`
	Message string `json:"message"`
}

type RatioBatchSkip struct {
	Field   string `json:"field"`
	Model   string `json:"model"`
	Message string `json:"message"`
}

type ratioBatchField struct {
	optionKey string
	values    map[string]float64
}

func newRatioBatchFields() map[string]ratioBatchField {
	return map[string]ratioBatchField{
		"model_ratio": {
			optionKey: "ModelRatio",
			values:    ratio_setting.GetModelRatioCopy(),
		},
		"completion_ratio": {
			optionKey: "CompletionRatio",
			values:    ratio_setting.GetCompletionRatioCopy(),
		},
		"cache_ratio": {
			optionKey: "CacheRatio",
			values:    ratio_setting.GetCacheRatioCopy(),
		},
		"create_cache_ratio": {
			optionKey: "CreateCacheRatio",
			values:    ratio_setting.GetCreateCacheRatioCopy(),
		},
		"image_ratio": {
			optionKey: "ImageRatio",
			values:    ratio_setting.GetImageRatioCopy(),
		},
		"audio_ratio": {
			optionKey: "AudioRatio",
			values:    ratio_setting.GetAudioRatioCopy(),
		},
		"audio_completion_ratio": {
			optionKey: "AudioCompletionRatio",
			values:    ratio_setting.GetAudioCompletionRatioCopy(),
		},
		"model_price": {
			optionKey: "ModelPrice",
			values:    ratio_setting.GetModelPriceCopy(),
		},
	}
}

func RatioBatchModels(c *gin.Context) {
	fields := newRatioBatchFields()
	modelSources := make(map[string]map[string]struct{})
	for _, modelName := range model.GetEnabledModels() {
		if modelSources[modelName] == nil {
			modelSources[modelName] = make(map[string]struct{})
		}
		modelSources[modelName]["ability"] = struct{}{}
	}
	for fieldName, field := range fields {
		for modelName := range field.values {
			if modelSources[modelName] == nil {
				modelSources[modelName] = make(map[string]struct{})
			}
			modelSources[modelName][fieldName] = struct{}{}
		}
	}

	modelNames := make([]string, 0, len(modelSources))
	for modelName := range modelSources {
		modelNames = append(modelNames, modelName)
	}
	sort.Strings(modelNames)

	metadataByName := make(map[string]model.Model)
	if len(modelNames) > 0 {
		var metadata []model.Model
		if err := model.DB.Where("model_name IN ? AND name_rule = ?", modelNames, model.NameRuleExact).Find(&metadata).Error; err != nil {
			common.ApiError(c, err)
			return
		}
		for _, item := range metadata {
			metadataByName[item.ModelName] = item
		}
	}
	channelsByModel, err := model.GetBoundChannelsByModelsMap(modelNames)
	if err != nil {
		common.ApiError(c, err)
		return
	}

	items := make([]PricingModelInventoryItem, 0, len(modelNames))
	for _, modelName := range modelNames {
		item := PricingModelInventoryItem{
			ModelName: modelName,
			Pricing:   pricingModelValues(fields, modelName),
			Channels:  channelsByModel[modelName],
		}
		if metadata, ok := metadataByName[modelName]; ok {
			item.Metadata = &metadata
		}
		for source := range modelSources[modelName] {
			item.Sources = append(item.Sources, source)
		}
		sort.Strings(item.Sources)
		items = append(items, item)
	}
	common.ApiSuccess(c, items)
}

func pricingModelValues(fields map[string]ratioBatchField, modelName string) PricingModelValues {
	values := PricingModelValues{}
	if value, ok := fields["model_ratio"].values[modelName]; ok {
		values.ModelRatio = &value
	}
	if value, ok := fields["completion_ratio"].values[modelName]; ok {
		values.CompletionRatio = &value
	}
	if value, ok := fields["cache_ratio"].values[modelName]; ok {
		values.CacheRatio = &value
	}
	if value, ok := fields["create_cache_ratio"].values[modelName]; ok {
		values.CreateCacheRatio = &value
	}
	if value, ok := fields["image_ratio"].values[modelName]; ok {
		values.ImageRatio = &value
	}
	if value, ok := fields["audio_ratio"].values[modelName]; ok {
		values.AudioRatio = &value
	}
	if value, ok := fields["audio_completion_ratio"].values[modelName]; ok {
		values.AudioCompletionRatio = &value
	}
	if value, ok := fields["model_price"].values[modelName]; ok {
		values.ModelPrice = &value
	}
	return values
}

func RatioBatchPreview(c *gin.Context) {
	_, changes, errors, skipped := evaluateRatioBatch(c)
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"changes":        changes,
			"errors":         errors,
			"skipped":        skipped,
			"affected_count": len(changes),
		},
	})
}

func RatioBatchApply(c *gin.Context) {
	fields, changes, errors, skipped := evaluateRatioBatch(c)
	if len(errors) > 0 {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "Batch pricing rules contain invalid changes",
			"data": gin.H{
				"changes": changes,
				"errors":  errors,
				"skipped": skipped,
			},
		})
		return
	}
	if len(changes) == 0 {
		common.ApiSuccess(c, gin.H{"affected_count": 0})
		return
	}

	updatedFields := make(map[string]struct{})
	for _, change := range changes {
		updatedFields[change.Field] = struct{}{}
		if change.Field == "model_price" {
			for fieldName, field := range fields {
				if fieldName == "model_price" {
					continue
				}
				if _, exists := field.values[change.Model]; exists {
					delete(field.values, change.Model)
					fields[fieldName] = field
					updatedFields[fieldName] = struct{}{}
				}
			}
			continue
		}
		priceField := fields["model_price"]
		if _, exists := priceField.values[change.Model]; exists {
			delete(priceField.values, change.Model)
			fields["model_price"] = priceField
			updatedFields["model_price"] = struct{}{}
		}
	}
	values := make(map[string]string, len(updatedFields))
	for field := range updatedFields {
		fieldData := fields[field]
		jsonBytes, err := common.Marshal(fieldData.values)
		if err != nil {
			common.ApiError(c, err)
			return
		}
		values[fieldData.optionKey] = string(jsonBytes)
	}
	if err := model.UpdateOptionsBulk(values); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{
		"changes":        changes,
		"skipped":        skipped,
		"affected_count": len(changes),
	})
}

func evaluateRatioBatch(c *gin.Context) (map[string]ratioBatchField, []RatioBatchChange, []RatioBatchError, []RatioBatchSkip) {
	var request RatioBatchRequest
	if err := common.DecodeJson(c.Request.Body, &request); err != nil {
		return nil, nil, []RatioBatchError{{Message: "Invalid request body"}}, nil
	}
	if len(request.Rules) == 0 || len(request.Rules) > maxRatioBatchRules {
		return nil, nil, []RatioBatchError{{Message: fmt.Sprintf("Rules must contain between 1 and %d items", maxRatioBatchRules)}}, nil
	}

	fields := newRatioBatchFields()
	changes := make([]RatioBatchChange, 0)
	errors := make([]RatioBatchError, 0)
	skipped := make([]RatioBatchSkip, 0)
	targetSet := make(map[string]struct{}, len(request.TargetModels))
	for _, modelName := range request.TargetModels {
		if modelName = strings.TrimSpace(modelName); modelName != "" {
			targetSet[modelName] = struct{}{}
		}
	}
	if len(targetSet) > maxBatchModels {
		return nil, nil, []RatioBatchError{{Message: "Target models must not exceed 500 items"}}, nil
	}
	if len(targetSet) > 0 {
		inventory := make(map[string]struct{})
		for _, modelName := range model.GetEnabledModels() {
			inventory[modelName] = struct{}{}
		}
		for _, field := range fields {
			for modelName := range field.values {
				inventory[modelName] = struct{}{}
			}
		}
		for modelName := range targetSet {
			if _, ok := inventory[modelName]; !ok {
				errors = append(errors, RatioBatchError{Model: modelName, Message: "Target model is not in the pricing inventory"})
			}
		}
	}

	for _, rule := range request.Rules {
		field, ok := fields[rule.Field]
		if !ok {
			errors = append(errors, RatioBatchError{Field: rule.Field, Message: "Unsupported pricing field"})
			continue
		}
		matcher, err := ratioBatchMatcher(rule.Match)
		if err != nil {
			errors = append(errors, RatioBatchError{Field: rule.Field, Message: err.Error()})
			continue
		}
		if math.IsNaN(rule.Op.Value) || math.IsInf(rule.Op.Value, 0) || (rule.Op.Type != "multiply" && rule.Op.Type != "set" && rule.Op.Type != "add") {
			errors = append(errors, RatioBatchError{Field: rule.Field, Message: "Operation must use a finite value and a supported type"})
			continue
		}
		if (rule.Op.Type == "multiply" || rule.Op.Type == "set") && rule.Op.Value < 0 {
			errors = append(errors, RatioBatchError{Field: rule.Field, Message: "Multiply and set operations require a non-negative value"})
			continue
		}

		modelNames := make([]string, 0)
		if len(targetSet) > 0 {
			for modelName := range targetSet {
				if matcher(modelName) {
					modelNames = append(modelNames, modelName)
				}
			}
		} else {
			for modelName := range field.values {
				if matcher(modelName) {
					modelNames = append(modelNames, modelName)
				}
			}
		}
		sort.Strings(modelNames)
		for _, modelName := range modelNames {
			oldValue, exists := field.values[modelName]
			if !exists && rule.Op.Type != "set" {
				skipped = append(skipped, RatioBatchSkip{Field: rule.Field, Model: modelName, Message: "No explicit value exists for this operation"})
				continue
			}
			newValue := oldValue
			switch rule.Op.Type {
			case "multiply":
				newValue *= rule.Op.Value
			case "set":
				newValue = rule.Op.Value
			case "add":
				newValue += rule.Op.Value
			}
			if !isFiniteNonNegative(newValue) {
				errors = append(errors, RatioBatchError{Field: rule.Field, Model: modelName, Message: "Result must be finite and non-negative"})
				continue
			}
			if !exists || oldValue != newValue {
				field.values[modelName] = newValue
				fields[rule.Field] = field
				changes = append(changes, RatioBatchChange{Field: rule.Field, Model: modelName, Old: oldValue, New: newValue})
			}
		}
	}
	return fields, changes, errors, skipped
}

func isFiniteNonNegative(value float64) bool {
	return value >= 0 && !math.IsNaN(value) && !math.IsInf(value, 0)
}

func ratioBatchMatcher(match RatioBatchMatch) (func(string) bool, error) {
	if len(match.Pattern) == 0 || len(match.Pattern) > maxRatioBatchPatternLength {
		return nil, fmt.Errorf("match pattern must contain between 1 and %d characters", maxRatioBatchPatternLength)
	}
	switch match.Type {
	case "prefix":
		return func(name string) bool { return strings.HasPrefix(name, match.Pattern) }, nil
	case "suffix":
		return func(name string) bool { return strings.HasSuffix(name, match.Pattern) }, nil
	case "contains":
		return func(name string) bool { return strings.Contains(name, match.Pattern) }, nil
	case "exact":
		return func(name string) bool { return name == match.Pattern }, nil
	case "regex":
		re, err := regexp.Compile(match.Pattern)
		if err != nil {
			return nil, fmt.Errorf("invalid regular expression: %w", err)
		}
		return re.MatchString, nil
	default:
		return nil, fmt.Errorf("unsupported match type")
	}
}
