package model

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// The monitoring endpoint is reachable by any authenticated user, so the
// serialized payload must never carry channel credentials or configuration.
func TestChannelMonitoringPayloadExposesOnlyHealthFields(t *testing.T) {
	baseURL := "https://upstream.internal.example"
	abilities := []AbilityWithChannel{
		{Ability: Ability{Model: "model-a", ChannelId: 1, Enabled: true}},
	}
	channels := map[int]*Channel{
		1: {
			Id:           1,
			Name:         "Primary",
			Status:       common.ChannelStatusEnabled,
			ResponseTime: 120,
			Key:          "sk-must-not-leak",
			BaseURL:      &baseURL,
		},
	}

	result := buildModelMonitoring(abilities, channels, nil, nil)
	require.Len(t, result, 1)

	encoded, err := common.Marshal(result[0])
	require.NoError(t, err)

	var payload map[string]any
	require.NoError(t, common.Unmarshal(encoded, &payload))

	expected := []string{
		"channel_id", "channel_name", "channel_type", "channel_status",
		"response_time", "test_time", "model_count", "request_count",
		"success_count", "availability", "average_latency", "recent", "models",
	}
	actual := make([]string, 0, len(payload))
	for field := range payload {
		actual = append(actual, field)
	}
	assert.ElementsMatch(t, expected, actual)
	assert.NotContains(t, string(encoded), "sk-must-not-leak")
	assert.NotContains(t, string(encoded), "upstream.internal.example")
}

func TestBuildModelMonitoringAggregatesModelsByChannel(t *testing.T) {
	priority := int64(0)
	abilities := []AbilityWithChannel{
		{Ability: Ability{Model: "model-a", ChannelId: 1, Enabled: true, Priority: &priority}},
		{Ability: Ability{Model: "model-b", ChannelId: 1, Enabled: true, Priority: &priority}},
		{Ability: Ability{Model: "model-c", ChannelId: 2, Enabled: true, Priority: &priority}},
	}
	channels := map[int]*Channel{
		1: {Id: 1, Name: "Primary", Type: 1, Status: common.ChannelStatusEnabled, ResponseTime: 120, TestTime: 1234},
		2: {Id: 2, Name: "Unobserved", Type: 24, Status: common.ChannelStatusEnabled},
	}
	aggregates := []monitoringAggregate{
		{ChannelID: 1, ModelName: "model-a", RequestCount: 3, SuccessCount: 3, LatencyTotal: 6},
		{ChannelID: 1, ModelName: "model-b", RequestCount: 1, SuccessCount: 0, LatencyTotal: 1},
	}
	logs := []monitoringLog{
		{ChannelID: 1, ModelName: "model-b", Type: LogTypeError},
		{ChannelID: 1, ModelName: "model-a", Type: LogTypeConsume},
		{ChannelID: 99, ModelName: "model-a", Type: LogTypeConsume},
		{ChannelID: 1, ModelName: "unsupported-model", Type: LogTypeConsume},
	}

	result := buildModelMonitoring(abilities, channels, aggregates, logs)
	require.Len(t, result, 2)

	primary := result[0]
	assert.Equal(t, 1, primary.ChannelID)
	assert.Equal(t, "Primary", primary.ChannelName)
	assert.Equal(t, 2, primary.ModelCount)
	assert.EqualValues(t, 4, primary.RequestCount)
	assert.EqualValues(t, 3, primary.SuccessCount)
	assert.InDelta(t, 75, primary.Availability, 0.001)
	assert.InDelta(t, 1750, primary.AverageLatency, 0.001)
	assert.Equal(t, []bool{false, true}, primary.Recent)
	require.Len(t, primary.Models, 2)
	assert.Equal(t, "model-a", primary.Models[0].ModelName)
	assert.Equal(t, "model-b", primary.Models[1].ModelName)
	assert.InDelta(t, 100, primary.Models[0].Availability, 0.001)
	assert.InDelta(t, 0, primary.Models[1].Availability, 0.001)

	unobserved := result[1]
	assert.Equal(t, 2, unobserved.ChannelID)
	assert.Equal(t, "Unobserved", unobserved.ChannelName)
	assert.Equal(t, 1, unobserved.ModelCount)
	assert.Zero(t, unobserved.RequestCount)
	assert.Empty(t, unobserved.Recent)
	require.Len(t, unobserved.Models, 1)
	assert.Equal(t, "model-c", unobserved.Models[0].ModelName)
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
	assert.Equal(t, 1, result[0].ModelCount)
	require.Len(t, result[0].Models, 1)
}
