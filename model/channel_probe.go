package model

import (
	"sort"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
)

type ChannelProbeTarget struct {
	Group       string
	ChannelID   int
	ChannelName string
	ChannelType int
	ModelName   string
}

type ChannelProbeResult struct {
	ID                   int64  `json:"id" gorm:"primaryKey"`
	Group                string `json:"group" gorm:"type:varchar(64);uniqueIndex:idx_probe_result_target,priority:1"`
	ChannelID            int    `json:"channel_id" gorm:"uniqueIndex:idx_probe_result_target,priority:2"`
	ModelName            string `json:"model_name" gorm:"type:varchar(255);uniqueIndex:idx_probe_result_target,priority:3"`
	Endpoint             string `json:"endpoint" gorm:"type:varchar(64)"`
	UpstreamModelName    string `json:"upstream_model_name" gorm:"type:varchar(255)"`
	Available            bool   `json:"available"`
	LatencyMS            int64  `json:"latency_ms"`
	LastProbeAt          int64  `json:"last_probe_at" gorm:"index"`
	LastSuccessAt        int64  `json:"last_success_at"`
	LastFailureAt        int64  `json:"last_failure_at"`
	LastStatusCode       int    `json:"last_status_code"`
	LastErrorCode        string `json:"last_error_code" gorm:"type:varchar(128)"`
	LastError            string `json:"last_error" gorm:"type:text"`
	ConsecutiveFailures  int    `json:"consecutive_failures"`
	ConsecutiveSuccesses int    `json:"consecutive_successes"`
	UpdatedAt            int64  `json:"updated_at" gorm:"index"`
}

type ChannelProbeHistory struct {
	ID                int64  `json:"id" gorm:"primaryKey"`
	Group             string `json:"group" gorm:"type:varchar(64);index:idx_probe_history_target,priority:1;index:idx_probe_history_group_time,priority:1"`
	ChannelID         int    `json:"channel_id" gorm:"index:idx_probe_history_target,priority:2"`
	ModelName         string `json:"model_name" gorm:"type:varchar(255);index:idx_probe_history_target,priority:3"`
	Endpoint          string `json:"endpoint" gorm:"type:varchar(64)"`
	UpstreamModelName string `json:"upstream_model_name" gorm:"type:varchar(255)"`
	Success           bool   `json:"success"`
	LatencyMS         int64  `json:"latency_ms"`
	ProbedAt          int64  `json:"probed_at" gorm:"index:idx_probe_history_target,priority:4;index:idx_probe_history_group_time,priority:2"`
	StatusCode        int    `json:"status_code"`
	ErrorCode         string `json:"error_code" gorm:"type:varchar(128)"`
	ErrorMessage      string `json:"error_message" gorm:"type:text"`
}

type channelProbeTargetKey struct {
	group     string
	channelID int
	model     string
}

func ChannelProbeTargets() ([]ChannelProbeTarget, error) {
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
	return buildChannelProbeTargets(abilities, channelMap), nil
}

func buildChannelProbeTargets(abilities []AbilityWithChannel, channelMap map[int]*Channel) []ChannelProbeTarget {
	targets := make([]ChannelProbeTarget, 0, len(abilities))
	seen := make(map[channelProbeTargetKey]struct{}, len(abilities))
	for _, ability := range abilities {
		channel := channelMap[ability.ChannelId]
		if channel == nil || channel.Status != common.ChannelStatusEnabled {
			continue
		}
		if !channelContainsGroup(channel.Group, ability.Group) {
			continue
		}
		key := channelProbeTargetKey{group: ability.Group, channelID: channel.Id, model: ability.Model}
		if _, exists := seen[key]; exists {
			continue
		}
		seen[key] = struct{}{}
		targets = append(targets, ChannelProbeTarget{
			Group:       ability.Group,
			ChannelID:   channel.Id,
			ChannelName: channel.Name,
			ChannelType: channel.Type,
			ModelName:   ability.Model,
		})
	}
	sort.Slice(targets, func(i, j int) bool {
		if targets[i].Group != targets[j].Group {
			return targets[i].Group < targets[j].Group
		}
		if targets[i].ChannelID != targets[j].ChannelID {
			return targets[i].ChannelID < targets[j].ChannelID
		}
		return targets[i].ModelName < targets[j].ModelName
	})
	return targets
}

func channelContainsGroup(channelGroups, group string) bool {
	for _, value := range strings.Split(channelGroups, ",") {
		if strings.TrimSpace(value) == group {
			return true
		}
	}
	return false
}

func SaveChannelProbeOutcome(outcome ChannelProbeOutcome) error {
	now := common.GetTimestamp()
	return DB.Transaction(func(tx *gorm.DB) error {
		result := ChannelProbeResult{}
		query := tx.Where(commonGroupCol+" = ? AND channel_id = ? AND model_name = ?", outcome.Group, outcome.ChannelID, outcome.ModelName).First(&result)
		if query.Error != nil && query.Error != gorm.ErrRecordNotFound {
			return query.Error
		}
		if query.Error == gorm.ErrRecordNotFound {
			result.Group = outcome.Group
			result.ChannelID = outcome.ChannelID
			result.ModelName = outcome.ModelName
		}
		result.Endpoint = outcome.Endpoint
		result.UpstreamModelName = outcome.UpstreamModelName
		result.Available = outcome.Success
		result.LatencyMS = outcome.LatencyMS
		result.LastProbeAt = outcome.ProbedAt
		result.LastStatusCode = outcome.StatusCode
		result.LastErrorCode = outcome.ErrorCode
		result.LastError = outcome.ErrorMessage
		result.UpdatedAt = now
		if outcome.Success {
			result.LastSuccessAt = outcome.ProbedAt
			result.ConsecutiveSuccesses++
			result.ConsecutiveFailures = 0
		} else {
			result.LastFailureAt = outcome.ProbedAt
			result.ConsecutiveFailures++
			result.ConsecutiveSuccesses = 0
		}
		if err := tx.Save(&result).Error; err != nil {
			return err
		}
		return tx.Create(&ChannelProbeHistory{
			Group:             outcome.Group,
			ChannelID:         outcome.ChannelID,
			ModelName:         outcome.ModelName,
			Endpoint:          outcome.Endpoint,
			UpstreamModelName: outcome.UpstreamModelName,
			Success:           outcome.Success,
			LatencyMS:         outcome.LatencyMS,
			ProbedAt:          outcome.ProbedAt,
			StatusCode:        outcome.StatusCode,
			ErrorCode:         outcome.ErrorCode,
			ErrorMessage:      outcome.ErrorMessage,
		}).Error
	})
}

type ChannelProbeOutcome struct {
	Group             string
	ChannelID         int
	ModelName         string
	Endpoint          string
	UpstreamModelName string
	Success           bool
	LatencyMS         int64
	ProbedAt          int64
	StatusCode        int
	ErrorCode         string
	ErrorMessage      string
}

type ChannelProbeHistoryRow struct {
	ChannelID         int
	ModelName         string
	Endpoint          string
	UpstreamModelName string
	Success           bool
	LatencyMS         int64
	ProbedAt          int64
	StatusCode        int
	ErrorCode         string
	ErrorMessage      string
}

func GetChannelProbeHistory(group string, channelID int, modelName string, start int64, limit int) ([]ChannelProbeHistoryRow, error) {
	if limit <= 0 {
		limit = 60
	}
	var rows []ChannelProbeHistoryRow
	err := DB.Table("channel_probe_histories").
		Select("channel_id, model_name, endpoint, upstream_model_name, success, latency_ms, probed_at, status_code, error_code, error_message").
		Where(commonGroupCol+" = ? AND channel_id = ? AND model_name = ? AND probed_at >= ?", group, channelID, modelName, start).
		Order("probed_at DESC, id DESC").Limit(limit).Scan(&rows).Error
	return rows, err
}

func DeleteOldChannelProbeHistory(before int64, limit int) (int64, error) {
	if limit <= 0 {
		limit = 1000
	}
	var ids []int64
	if err := DB.Model(&ChannelProbeHistory{}).Where("probed_at < ?", before).Order("id").Limit(limit).Pluck("id", &ids).Error; err != nil {
		return 0, err
	}
	if len(ids) == 0 {
		return 0, nil
	}
	result := DB.Delete(&ChannelProbeHistory{}, ids)
	return result.RowsAffected, result.Error
}

func ProbeHistoryStart(days int) int64 {
	if days != 7 && days != 15 && days != 30 {
		days = 7
	}
	return time.Now().AddDate(0, 0, -days).Unix()
}
