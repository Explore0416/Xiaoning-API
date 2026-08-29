package controller

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestRatioBatchModelsIncludesEnabledAbilityAndMetadata(t *testing.T) {
	db := setupModelListControllerTestDB(t)
	metadata := model.Model{
		ModelName:    "ability-only-model",
		Tags:         "chat",
		Status:       1,
		SyncOfficial: 1,
	}
	require.NoError(t, db.Create(&metadata).Error)
	channel := model.Channel{Name: "inventory-channel", Type: 1, Status: 1}
	require.NoError(t, db.Create(&channel).Error)
	require.NoError(t, db.Create(&model.Ability{
		Group:     "default",
		Model:     metadata.ModelName,
		ChannelId: channel.Id,
		Enabled:   true,
	}).Error)

	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = httptest.NewRequest(http.MethodGet, "/api/ratio_batch/models", nil)

	RatioBatchModels(context)

	require.Equal(t, http.StatusOK, recorder.Code)
	var response struct {
		Success bool                        `json:"success"`
		Data    []PricingModelInventoryItem `json:"data"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	require.True(t, response.Success)
	item := findPricingInventoryItem(response.Data, metadata.ModelName)
	require.NotNil(t, item)
	assert.Contains(t, item.Sources, "ability")
	require.NotNil(t, item.Metadata)
	assert.Equal(t, "chat", item.Metadata.Tags)
	require.Len(t, item.Channels, 1)
	assert.Equal(t, "inventory-channel", item.Channels[0].Name)
}

func findPricingInventoryItem(items []PricingModelInventoryItem, modelName string) *PricingModelInventoryItem {
	for i := range items {
		if items[i].ModelName == modelName {
			return &items[i]
		}
	}
	return nil
}
