package model

import (
	"sort"
	"time"
)

type ChannelMonitoringModel struct {
	ModelName      string  `json:"model_name"`
	RequestCount   int64   `json:"request_count"`
	SuccessCount   int64   `json:"success_count"`
	Availability   float64 `json:"availability"`
	AverageLatency float64 `json:"average_latency"`
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
	Recent         []bool                   `json:"recent"`
	Models         []ChannelMonitoringModel `json:"models"`
}

type monitoringAggregate struct {
	ChannelID    int
	ModelName    string
	RequestCount int64
	SuccessCount int64
	LatencyTotal int64
}

type monitoringLog struct {
	ChannelID int
	ModelName string
	Type      int
}

type monitoringKey struct {
	channelID int
	model     string
}

func GetModelMonitoring(days int) ([]ChannelMonitoring, error) {
	if days != 7 && days != 15 && days != 30 {
		days = 7
	}
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

	start := time.Now().AddDate(0, 0, -days).Unix()
	var aggregates []monitoringAggregate
	if err := LOG_DB.Table("logs").
		Select("channel_id, model_name, COUNT(*) AS request_count, SUM(CASE WHEN type = ? THEN 1 ELSE 0 END) AS success_count, COALESCE(SUM(use_time), 0) AS latency_total", LogTypeConsume).
		Where("created_at >= ? AND type IN (?, ?)", start, LogTypeConsume, LogTypeError).
		Group("channel_id, model_name").Scan(&aggregates).Error; err != nil {
		return nil, err
	}
	var logs []monitoringLog
	if err := LOG_DB.Table("logs").Select("channel_id, model_name, type").
		Where("created_at >= ? AND type IN (?, ?)", start, LogTypeConsume, LogTypeError).
		Order("created_at DESC, id DESC").Limit(10000).Find(&logs).Error; err != nil {
		return nil, err
	}

	return buildModelMonitoring(abilities, channelMap, aggregates, logs), nil
}

func buildModelMonitoring(abilities []AbilityWithChannel, channelMap map[int]*Channel, aggregates []monitoringAggregate, logs []monitoringLog) []ChannelMonitoring {
	statsByKey := make(map[monitoringKey]monitoringAggregate, len(aggregates))
	for _, aggregate := range aggregates {
		statsByKey[monitoringKey{channelID: aggregate.ChannelID, model: aggregate.ModelName}] = aggregate
	}

	channelsByID := make(map[int]*ChannelMonitoring)
	validKeys := make(map[monitoringKey]struct{}, len(abilities))
	for _, ability := range abilities {
		channel := channelMap[ability.ChannelId]
		if channel == nil {
			continue
		}
		key := monitoringKey{channelID: ability.ChannelId, model: ability.Model}
		if _, exists := validKeys[key]; exists {
			continue
		}
		validKeys[key] = struct{}{}

		item := channelsByID[channel.Id]
		if item == nil {
			item = &ChannelMonitoring{
				ChannelID:     channel.Id,
				ChannelName:   channel.Name,
				ChannelType:   channel.Type,
				ChannelStatus: channel.Status,
				ResponseTime:  channel.ResponseTime,
				TestTime:      channel.TestTime,
				Recent:        []bool{},
				Models:        []ChannelMonitoringModel{},
			}
			channelsByID[channel.Id] = item
		}

		modelItem := ChannelMonitoringModel{ModelName: ability.Model}
		if aggregate, exists := statsByKey[key]; exists {
			modelItem.RequestCount = aggregate.RequestCount
			modelItem.SuccessCount = aggregate.SuccessCount
			if aggregate.RequestCount > 0 {
				modelItem.Availability = float64(aggregate.SuccessCount) * 100 / float64(aggregate.RequestCount)
				modelItem.AverageLatency = float64(aggregate.LatencyTotal) * 1000 / float64(aggregate.RequestCount)
			}
		}

		item.ModelCount++
		item.RequestCount += modelItem.RequestCount
		item.SuccessCount += modelItem.SuccessCount
		item.AverageLatency += modelItem.AverageLatency * float64(modelItem.RequestCount)
		item.Models = append(item.Models, modelItem)
	}

	for _, log := range logs {
		key := monitoringKey{channelID: log.ChannelID, model: log.ModelName}
		if _, exists := validKeys[key]; !exists {
			continue
		}
		item := channelsByID[log.ChannelID]
		if item != nil && len(item.Recent) < 60 {
			item.Recent = append(item.Recent, log.Type == LogTypeConsume)
		}
	}

	result := make([]ChannelMonitoring, 0, len(channelsByID))
	for _, item := range channelsByID {
		if item.RequestCount > 0 {
			item.Availability = float64(item.SuccessCount) * 100 / float64(item.RequestCount)
			item.AverageLatency /= float64(item.RequestCount)
		}
		sort.Slice(item.Models, func(i, j int) bool {
			return item.Models[i].ModelName < item.Models[j].ModelName
		})
		result = append(result, *item)
	}
	sort.Slice(result, func(i, j int) bool {
		return result[i].ChannelName < result[j].ChannelName
	})
	return result
}
