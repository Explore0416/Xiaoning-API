package model

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestBuildChannelMonitoringFiltersGroupAndUsesProbeHistory(t *testing.T) {
	abilities := []AbilityWithChannel{
		{Ability: Ability{Group: "default", Model: "model-a", ChannelId: 1, Enabled: true}},
		{Ability: Ability{Group: "default", Model: "model-b", ChannelId: 1, Enabled: true}},
		{Ability: Ability{Group: "vip", Model: "model-a", ChannelId: 1, Enabled: true}},
		{Ability: Ability{Group: "default", Model: "disabled-model", ChannelId: 2, Enabled: true}},
	}
	channels := map[int]*Channel{
		1: {Id: 1, Name: "Primary", Type: 1, Group: "default,vip", Status: common.ChannelStatusEnabled},
		2: {Id: 2, Name: "Disabled", Group: "default", Status: common.ChannelStatusManuallyDisabled},
	}
	history := []ChannelProbeHistory{
		{ID: 4, Group: "default", ChannelID: 1, ModelName: "model-a", Success: false, LatencyMS: 400, ProbedAt: 400, ErrorCode: "bad_response"},
		{ID: 3, Group: "default", ChannelID: 1, ModelName: "model-a", Success: true, LatencyMS: 200, ProbedAt: 300},
		{ID: 2, Group: "default", ChannelID: 1, ModelName: "model-b", Success: true, LatencyMS: 100, ProbedAt: 200},
		{ID: 1, Group: "vip", ChannelID: 1, ModelName: "model-a", Success: true, LatencyMS: 10, ProbedAt: 100},
	}

	result := buildChannelMonitoring("default", abilities, channels, history)
	require.Len(t, result, 1)
	item := result[0]
	assert.Equal(t, "Primary", item.ChannelName)
	assert.Equal(t, "active_probe", item.DataSource)
	assert.Equal(t, 2, item.ModelCount)
	assert.EqualValues(t, 3, item.RequestCount)
	assert.EqualValues(t, 2, item.SuccessCount)
	assert.InDelta(t, 66.666, item.Availability, 0.01)
	assert.InDelta(t, 233.333, item.AverageLatency, 0.01)
	assert.Equal(t, int64(400), item.LastProbeAt)
	assert.Equal(t, []bool{false, true, true}, item.Recent)

	require.Len(t, item.Models, 2)
	modelA := item.Models[0]
	assert.Equal(t, "model-a", modelA.ModelName)
	assert.False(t, modelA.Available)
	assert.Equal(t, "bad_response", modelA.ErrorCode)
	assert.EqualValues(t, 2, modelA.RequestCount)
	assert.EqualValues(t, 1, modelA.SuccessCount)
	assert.InDelta(t, 50, modelA.Availability, 0.001)
	assert.InDelta(t, 300, modelA.AverageLatency, 0.001)
	assert.Equal(t, int64(400), modelA.LastProbeAt)

	modelB := item.Models[1]
	assert.Equal(t, "model-b", modelB.ModelName)
	assert.True(t, modelB.Available)
}

func TestBuildChannelMonitoringKeepsUnknownModelWithoutHistory(t *testing.T) {
	abilities := []AbilityWithChannel{
		{Ability: Ability{Group: "default", Model: "untested", ChannelId: 1, Enabled: true}},
	}
	channels := map[int]*Channel{
		1: {Id: 1, Name: "Unobserved", Group: "default", Status: common.ChannelStatusEnabled},
	}

	result := buildChannelMonitoring("default", abilities, channels, nil)
	require.Len(t, result, 1)
	assert.Zero(t, result[0].RequestCount)
	assert.Empty(t, result[0].Recent)
	require.Len(t, result[0].Models, 1)
	assert.Zero(t, result[0].Models[0].LastProbeAt)
	assert.False(t, result[0].Models[0].Available)
	assert.Empty(t, result[0].Models[0].History)
}

func TestBuildChannelMonitoringDeduplicatesAbilityGroups(t *testing.T) {
	abilities := []AbilityWithChannel{
		{Ability: Ability{Group: "default", Model: "model-a", ChannelId: 1, Enabled: true}},
		{Ability: Ability{Group: "default", Model: "model-a", ChannelId: 1, Enabled: true}},
	}
	channels := map[int]*Channel{
		1: {Id: 1, Name: "Primary", Group: "default", Status: common.ChannelStatusEnabled},
	}

	result := buildChannelMonitoring("default", abilities, channels, nil)
	require.Len(t, result, 1)
	assert.Equal(t, 1, result[0].ModelCount)
	require.Len(t, result[0].Models, 1)
}
