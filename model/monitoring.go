package model

import (
	"sort"
	"time"

	"github.com/QuantumNous/new-api/common"
)

type ModelMonitoringChannel struct {
	ChannelID      int     `json:"channel_id"`
	ChannelName    string  `json:"channel_name"`
	ChannelType    int     `json:"channel_type"`
	ChannelStatus  int     `json:"channel_status"`
	ResponseTime   int     `json:"response_time"`
	TestTime       int64   `json:"test_time"`
	RequestCount   int64   `json:"request_count"`
	SuccessCount   int64   `json:"success_count"`
	Availability   float64 `json:"availability"`
	AverageLatency float64 `json:"average_latency"`
}

type ModelMonitoring struct {
	Model                 string                   `json:"model"`
	ChannelCount          int                      `json:"channel_count"`
	AvailableChannelCount int                      `json:"available_channel_count"`
	RequestCount          int64                    `json:"request_count"`
	SuccessCount          int64                    `json:"success_count"`
	Availability          float64                  `json:"availability"`
	AverageLatency        float64                  `json:"average_latency"`
	Recent                []bool                   `json:"recent"`
	Channels              []ModelMonitoringChannel `json:"channels"`
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

func GetModelMonitoring(days int) ([]ModelMonitoring, error) {
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

func buildModelMonitoring(abilities []AbilityWithChannel, channelMap map[int]*Channel, aggregates []monitoringAggregate, logs []monitoringLog) []ModelMonitoring {
	statsByKey := make(map[monitoringKey]monitoringAggregate, len(aggregates))
	for _, aggregate := range aggregates {
		statsByKey[monitoringKey{channelID: aggregate.ChannelID, model: aggregate.ModelName}] = aggregate
	}

	modelsByName := make(map[string]*ModelMonitoring)
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

		item := modelsByName[ability.Model]
		if item == nil {
			item = &ModelMonitoring{
				Model:    ability.Model,
				Recent:   []bool{},
				Channels: []ModelMonitoringChannel{},
			}
			modelsByName[ability.Model] = item
		}

		channelItem := ModelMonitoringChannel{
			ChannelID:     channel.Id,
			ChannelName:   channel.Name,
			ChannelType:   channel.Type,
			ChannelStatus: channel.Status,
			ResponseTime:  channel.ResponseTime,
			TestTime:      channel.TestTime,
		}
		if aggregate, exists := statsByKey[key]; exists {
			channelItem.RequestCount = aggregate.RequestCount
			channelItem.SuccessCount = aggregate.SuccessCount
			if aggregate.RequestCount > 0 {
				channelItem.Availability = float64(aggregate.SuccessCount) * 100 / float64(aggregate.RequestCount)
				channelItem.AverageLatency = float64(aggregate.LatencyTotal) * 1000 / float64(aggregate.RequestCount)
			}
		}

		item.ChannelCount++
		if channel.Status == common.ChannelStatusEnabled {
			item.AvailableChannelCount++
		}
		item.RequestCount += channelItem.RequestCount
		item.SuccessCount += channelItem.SuccessCount
		item.AverageLatency += channelItem.AverageLatency * float64(channelItem.RequestCount)
		item.Channels = append(item.Channels, channelItem)
	}

	for _, log := range logs {
		key := monitoringKey{channelID: log.ChannelID, model: log.ModelName}
		if _, exists := validKeys[key]; !exists {
			continue
		}
		item := modelsByName[log.ModelName]
		if item != nil && len(item.Recent) < 60 {
			item.Recent = append(item.Recent, log.Type == LogTypeConsume)
		}
	}

	result := make([]ModelMonitoring, 0, len(modelsByName))
	for _, item := range modelsByName {
		if item.RequestCount > 0 {
			item.Availability = float64(item.SuccessCount) * 100 / float64(item.RequestCount)
			item.AverageLatency /= float64(item.RequestCount)
		}
		sort.Slice(item.Channels, func(i, j int) bool {
			return item.Channels[i].ChannelName < item.Channels[j].ChannelName
		})
		result = append(result, *item)
	}
	sort.Slice(result, func(i, j int) bool {
		return result[i].Model < result[j].Model
	})
	return result
}
