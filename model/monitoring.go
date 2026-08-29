package model

import (
	"sort"

	"github.com/QuantumNous/new-api/common"
)

type ChannelMonitoringModel struct {
	ModelName      string                   `json:"model_name"`
	RequestCount   int64                    `json:"request_count"`
	SuccessCount   int64                    `json:"success_count"`
	Availability   float64                  `json:"availability"`
	AverageLatency float64                  `json:"average_latency"`
	Available      bool                     `json:"available"`
	LastProbeAt    int64                    `json:"last_probe_at"`
	History        []ChannelProbeHistoryRow `json:"history"`
	ErrorCode      string                   `json:"error_code,omitempty"`
}

type ChannelMonitoring struct {
	ChannelID      int                      `json:"channel_id"`
	ChannelName    string                   `json:"channel_name"`
	ChannelType    int                      `json:"channel_type"`
	ChannelStatus  int                      `json:"channel_status"`
	ResponseTime   int                      `json:"response_time"`
	TestTime       int64                    `json:"test_time"`
	ModelCount     int                      `json:"model_count"`
	RequestCount   int64                    `json:"request_count"`
	SuccessCount   int64                    `json:"success_count"`
	Availability   float64                  `json:"availability"`
	AverageLatency float64                  `json:"average_latency"`
	LastProbeAt    int64                    `json:"last_probe_at"`
	DataSource     string                   `json:"data_source"`
	Recent         []bool                   `json:"recent"`
	Models         []ChannelMonitoringModel `json:"models"`
}

func GetModelMonitoring(days int, group string) ([]ChannelMonitoring, error) {
	abilities, err := GetAllEnableAbilityWithChannels()
	if err != nil {
		return nil, err
	}
	channels, err := GetAllChannels(0, 0, true, true)
	if err != nil {
		return nil, err
	}
	channelMap := make(map[int]*Channel, len(channels))
	for _, channel := range channels {
		channelMap[channel.Id] = channel
	}
	var history []ChannelProbeHistory
	if err := DB.Where(commonGroupCol+" = ? AND probed_at >= ?", group, ProbeHistoryStart(days)).
		Order("probed_at DESC, id DESC").Find(&history).Error; err != nil {
		return nil, err
	}
	return buildChannelMonitoring(group, abilities, channelMap, history), nil
}

func buildChannelMonitoring(group string, abilities []AbilityWithChannel, channelMap map[int]*Channel, history []ChannelProbeHistory) []ChannelMonitoring {
	historyByKey := make(map[channelProbeTargetKey][]ChannelProbeHistoryRow)
	recentByChannel := make(map[int][]bool)
	for _, entry := range history {
		if entry.Group != group {
			continue
		}
		key := channelProbeTargetKey{group: group, channelID: entry.ChannelID, model: entry.ModelName}
		if len(historyByKey[key]) < 60 {
			historyByKey[key] = append(historyByKey[key], ChannelProbeHistoryRow{
				ChannelID: entry.ChannelID, ModelName: entry.ModelName, Endpoint: entry.Endpoint,
				UpstreamModelName: entry.UpstreamModelName, Success: entry.Success, LatencyMS: entry.LatencyMS,
				ProbedAt: entry.ProbedAt, StatusCode: entry.StatusCode, ErrorCode: entry.ErrorCode,
				ErrorMessage: entry.ErrorMessage,
			})
		}
		if len(recentByChannel[entry.ChannelID]) < 60 {
			recentByChannel[entry.ChannelID] = append(recentByChannel[entry.ChannelID], entry.Success)
		}
	}

	itemsByChannel := make(map[int]*ChannelMonitoring)
	seen := make(map[channelProbeTargetKey]struct{})
	for _, ability := range abilities {
		if ability.Group != group {
			continue
		}
		channel := channelMap[ability.ChannelId]
		if channel == nil || channel.Status != common.ChannelStatusEnabled || !channelContainsGroup(channel.Group, group) {
			continue
		}
		key := channelProbeTargetKey{group: group, channelID: channel.Id, model: ability.Model}
		if _, exists := seen[key]; exists {
			continue
		}
		seen[key] = struct{}{}
		item := itemsByChannel[channel.Id]
		if item == nil {
			item = &ChannelMonitoring{
				ChannelID: channel.Id, ChannelName: channel.Name, ChannelType: channel.Type,
				ChannelStatus: channel.Status, ResponseTime: channel.ResponseTime, TestTime: channel.TestTime,
				DataSource: "active_probe", Recent: recentByChannel[channel.Id], Models: []ChannelMonitoringModel{},
			}
			itemsByChannel[channel.Id] = item
		}

		modelItem := ChannelMonitoringModel{ModelName: ability.Model, History: historyByKey[key]}
		modelItem.RequestCount = int64(len(modelItem.History))
		for _, probe := range modelItem.History {
			if probe.Success {
				modelItem.SuccessCount++
			}
			modelItem.AverageLatency += float64(probe.LatencyMS)
		}
		if modelItem.RequestCount > 0 {
			modelItem.Availability = float64(modelItem.SuccessCount) * 100 / float64(modelItem.RequestCount)
			modelItem.AverageLatency /= float64(modelItem.RequestCount)
			modelItem.Available = modelItem.History[0].Success
			modelItem.LastProbeAt = modelItem.History[0].ProbedAt
			modelItem.ErrorCode = modelItem.History[0].ErrorCode
			item.LastProbeAt = maxInt64(item.LastProbeAt, modelItem.LastProbeAt)
		}
		item.ModelCount++
		item.RequestCount += modelItem.RequestCount
		item.SuccessCount += modelItem.SuccessCount
		item.AverageLatency += modelItem.AverageLatency * float64(modelItem.RequestCount)
		item.Models = append(item.Models, modelItem)
	}

	result := make([]ChannelMonitoring, 0, len(itemsByChannel))
	for _, item := range itemsByChannel {
		if item.RequestCount > 0 {
			item.Availability = float64(item.SuccessCount) * 100 / float64(item.RequestCount)
			item.AverageLatency /= float64(item.RequestCount)
		}
		sort.Slice(item.Models, func(i, j int) bool { return item.Models[i].ModelName < item.Models[j].ModelName })
		result = append(result, *item)
	}
	sort.Slice(result, func(i, j int) bool { return result[i].ChannelName < result[j].ChannelName })
	return result
}

func maxInt64(left, right int64) int64 {
	if left > right {
		return left
	}
	return right
}
