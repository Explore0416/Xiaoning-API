package controller

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestBatchDeleteModelsSoftDeletesMetadataAndReportsReferences(t *testing.T) {
	db := setupModelListControllerTestDB(t)
	modelMeta := model.Model{ModelName: "referenced-model", Status: 1, SyncOfficial: 1}
	require.NoError(t, db.Create(&modelMeta).Error)
	channel := model.Channel{Name: "test-channel", Type: 1, Status: 1}
	require.NoError(t, db.Create(&channel).Error)
	require.NoError(t, db.Create(&model.Ability{
		Group:     "default",
		Model:     modelMeta.ModelName,
		ChannelId: channel.Id,
		Enabled:   true,
	}).Error)

	body := []byte(`{"ids":[` + strconv.Itoa(modelMeta.Id) + `]}`)
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = httptest.NewRequest(http.MethodDelete, "/api/models/batch", bytes.NewReader(body))

	BatchDeleteModels(context)

	require.Equal(t, http.StatusOK, recorder.Code)
	var response struct {
		Success bool `json:"success"`
		Data    struct {
			Deleted    []string               `json:"deleted"`
			Referenced []batchReferencedModel `json:"referenced"`
		} `json:"data"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	assert.True(t, response.Success)
	assert.Equal(t, []string{"referenced-model"}, response.Data.Deleted)
	require.Len(t, response.Data.Referenced, 1)
	assert.Equal(t, "referenced-model", response.Data.Referenced[0].ModelName)

	var remaining model.Model
	require.Error(t, db.First(&remaining, modelMeta.Id).Error)
	var abilityCount int64
	require.NoError(t, db.Model(&model.Ability{}).Where("model = ?", modelMeta.ModelName).Count(&abilityCount).Error)
	assert.Equal(t, int64(1), abilityCount)
}

func TestBatchUpdateModelsOnlyChangesPatchedFields(t *testing.T) {
	db := setupModelListControllerTestDB(t)
	metadata := model.Model{
		ModelName:    "patch-model",
		Description:  "keep this description",
		Tags:         "old",
		Status:       1,
		SyncOfficial: 1,
	}
	require.NoError(t, db.Create(&metadata).Error)

	body := []byte(`{"ids":[` + strconv.Itoa(metadata.Id) + `],"patch":{"tags":"new"}}`)
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = httptest.NewRequest(http.MethodPut, "/api/models/batch", bytes.NewReader(body))

	BatchUpdateModels(context)

	require.Equal(t, http.StatusOK, recorder.Code)
	var updated model.Model
	require.NoError(t, db.First(&updated, metadata.Id).Error)
	assert.Equal(t, "new", updated.Tags)
	assert.Equal(t, "keep this description", updated.Description)
	assert.Equal(t, 1, updated.Status)
	assert.Equal(t, 1, updated.SyncOfficial)
}

func TestBatchCreateModelsSkipsExistingNames(t *testing.T) {
	db := setupModelListControllerTestDB(t)
	require.NoError(t, db.Create(&model.Model{
		ModelName:    "existing-model",
		Status:       1,
		SyncOfficial: 1,
	}).Error)

	body := []byte(`{"models":[{"model_name":"existing-model"},{"model_name":"new-model"}]}`)
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = httptest.NewRequest(http.MethodPost, "/api/models/batch", bytes.NewReader(body))

	BatchCreateModels(context)

	require.Equal(t, http.StatusOK, recorder.Code)
	var response struct {
		Success bool `json:"success"`
		Data    struct {
			Created []model.Model    `json:"created"`
			Skipped []batchModelSkip `json:"skipped"`
		} `json:"data"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	assert.True(t, response.Success)
	require.Len(t, response.Data.Created, 1)
	assert.Equal(t, "new-model", response.Data.Created[0].ModelName)
	assert.Equal(t, 1, response.Data.Created[0].Status)
	assert.Equal(t, 1, response.Data.Created[0].SyncOfficial)
	require.Len(t, response.Data.Skipped, 1)
	assert.Equal(t, "existing-model", response.Data.Skipped[0].ModelName)

	var count int64
	require.NoError(t, db.Model(&model.Model{}).Where("model_name IN ?", []string{"existing-model", "new-model"}).Count(&count).Error)
	assert.Equal(t, int64(2), count)
}
