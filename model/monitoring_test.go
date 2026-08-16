package model

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestBuildModelMonitoringAggregatesChannelsAndRecentLogs(t *testing.T) {
	priority := int64(0)
	abilities := []AbilityWithChannel{
		{Ability: Ability{Model: "model-a", ChannelId: 1, Enabled: true, Priority: &priority}},
		{Ability: Ability{Model: "model-a", ChannelId: 2, Enabled: true, Priority: &priority}},
		{Ability: Ability{Model: "model-b", ChannelId: 3, Enabled: true, Priority: &priority}},
	}
	channels := map[int]*Channel{
		1: {Id: 1, Name: "Primary", Type: 1, Status: common.ChannelStatusEnabled, ResponseTime: 120},
		2: {Id: 2, Name: "Fallback", Type: 14, Status: common.ChannelStatusAutoDisabled, ResponseTime: 240},
		3: {Id: 3, Name: "Unobserved", Type: 24, Status: common.ChannelStatusEnabled},
	}
	aggregates := []monitoringAggregate{
		{ChannelID: 1, ModelName: "model-a", RequestCount: 3, SuccessCount: 3, LatencyTotal: 6},
		{ChannelID: 2, ModelName: "model-a", RequestCount: 1, SuccessCount: 0, LatencyTotal: 1},
	}
	logs := []monitoringLog{
		{ChannelID: 2, ModelName: "model-a", Type: LogTypeError},
		{ChannelID: 1, ModelName: "model-a", Type: LogTypeConsume},
		{ChannelID: 99, ModelName: "model-a", Type: LogTypeConsume},
		{ChannelID: 1, ModelName: "other-model", Type: LogTypeConsume},
	}

	result := buildModelMonitoring(abilities, channels, aggregates, logs)
	require.Len(t, result, 2)

	modelA := result[0]
	assert.Equal(t, "model-a", modelA.Model)
	assert.Equal(t, 2, modelA.ChannelCount)
	assert.Equal(t, 1, modelA.AvailableChannelCount)
	assert.EqualValues(t, 4, modelA.RequestCount)
	assert.EqualValues(t, 3, modelA.SuccessCount)
	assert.InDelta(t, 75, modelA.Availability, 0.001)
	assert.InDelta(t, 1750, modelA.AverageLatency, 0.001)
	assert.Equal(t, []bool{false, true}, modelA.Recent)
	require.Len(t, modelA.Channels, 2)
	assert.Equal(t, "Fallback", modelA.Channels[0].ChannelName)
	assert.Equal(t, "Primary", modelA.Channels[1].ChannelName)

	modelB := result[1]
	assert.Equal(t, "model-b", modelB.Model)
	assert.Equal(t, 1, modelB.ChannelCount)
	assert.Equal(t, 1, modelB.AvailableChannelCount)
	assert.Zero(t, modelB.RequestCount)
	assert.Empty(t, modelB.Recent)
	require.Len(t, modelB.Channels, 1)
	assert.Equal(t, "Unobserved", modelB.Channels[0].ChannelName)
}

func TestBuildModelMonitoringDeduplicatesAbilityGroups(t *testing.T) {
	abilities := []AbilityWithChannel{
		{Ability: Ability{Group: "default", Model: "model-a", ChannelId: 1, Enabled: true}},
		{Ability: Ability{Group: "vip", Model: "model-a", ChannelId: 1, Enabled: true}},
	}
	channels := map[int]*Channel{
		1: {Id: 1, Name: "Primary", Status: common.ChannelStatusEnabled},
	}

	result := buildModelMonitoring(abilities, channels, nil, nil)

	require.Len(t, result, 1)
	assert.Equal(t, 1, result[0].ChannelCount)
	require.Len(t, result[0].Channels, 1)
}
