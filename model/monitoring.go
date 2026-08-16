package model

import (
	"sort"
	"time"
)

type ModelChannelMonitoring struct {
	Model          string  `json:"model"`
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
	Recent         []bool  `json:"recent"`
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

func GetModelChannelMonitoring(days int) ([]ModelChannelMonitoring, error) {
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
		Order("created_at DESC").Limit(10000).Find(&logs).Error; err != nil {
		return nil, err
	}

	type key struct {
		channelID int
		model     string
	}
	type stats struct {
		requestCount int64
		successCount int64
		latencyTotal int64
		recent       []bool
	}
	statsByKey := make(map[key]*stats, len(aggregates))
	for _, aggregate := range aggregates {
		statsByKey[key{channelID: aggregate.ChannelID, model: aggregate.ModelName}] = &stats{
			requestCount: aggregate.RequestCount,
			successCount: aggregate.SuccessCount,
			latencyTotal: aggregate.LatencyTotal,
			recent:       make([]bool, 0, 60),
		}
	}
	for _, log := range logs {
		if log.ChannelID == 0 || log.ModelName == "" {
			continue
		}
		entry := statsByKey[key{channelID: log.ChannelID, model: log.ModelName}]
		if entry != nil && len(entry.recent) < 60 {
			entry.recent = append(entry.recent, log.Type == LogTypeConsume)
		}
	}

	result := make([]ModelChannelMonitoring, 0, len(abilities))
	seen := make(map[key]struct{}, len(abilities))
	for _, ability := range abilities {
		channel := channelMap[ability.ChannelId]
		if channel == nil {
			continue
		}
		k := key{channelID: ability.ChannelId, model: ability.Model}
		if _, exists := seen[k]; exists {
			continue
		}
		seen[k] = struct{}{}
		item := ModelChannelMonitoring{
			Model:         ability.Model,
			ChannelID:     channel.Id,
			ChannelName:   channel.Name,
			ChannelType:   channel.Type,
			ChannelStatus: channel.Status,
			ResponseTime:  channel.ResponseTime,
			TestTime:      channel.TestTime,
			Recent:        []bool{},
		}
		if entry := statsByKey[k]; entry != nil {
			item.RequestCount = entry.requestCount
			item.SuccessCount = entry.successCount
			item.Recent = entry.recent
			if entry.requestCount > 0 {
				item.AverageLatency = float64(entry.latencyTotal*1000) / float64(entry.requestCount)
				item.Availability = float64(entry.successCount) * 100 / float64(entry.requestCount)
			}
		}
		result = append(result, item)
	}
	sort.Slice(result, func(i, j int) bool {
		if result[i].Model == result[j].Model {
			return result[i].ChannelName < result[j].ChannelName
		}
		return result[i].Model < result[j].Model
	})
	return result, nil
}
