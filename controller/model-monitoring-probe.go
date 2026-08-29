package controller

import (
	"context"
	"fmt"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
)

type modelMonitoringProbeHandler struct{}

func (modelMonitoringProbeHandler) Type() string {
	return model.SystemTaskTypeModelMonitoringProbe
}

func (modelMonitoringProbeHandler) Enabled() bool {
	return common.GetEnvOrDefaultBool("MODEL_MONITORING_PROBE_ENABLED", true)
}

func (modelMonitoringProbeHandler) Interval() time.Duration {
	minutes := common.GetEnvOrDefault("MODEL_MONITORING_PROBE_INTERVAL_MINUTES", 10)
	if minutes < 1 {
		minutes = 10
	}
	return time.Duration(minutes) * time.Minute
}

func (modelMonitoringProbeHandler) NewPayload() any { return nil }

func (modelMonitoringProbeHandler) Run(ctx context.Context, task *model.SystemTask, runnerID string) {
	started := time.Now()
	testUserID, err := resolveChannelTestUserID(nil)
	if err != nil {
		finishSystemTaskHandler(task, runnerID, model.SystemTaskStatusFailed, nil, err)
		return
	}
	targets, err := model.ChannelProbeTargets()
	if err != nil {
		finishSystemTaskHandler(task, runnerID, model.SystemTaskStatusFailed, nil, err)
		return
	}
	saveFailures := 0
	for _, target := range targets {
		if ctx != nil {
			select {
			case <-ctx.Done():
				finishSystemTaskHandler(task, runnerID, model.SystemTaskStatusFailed, nil, ctx.Err())
				return
			default:
			}
		}
		outcome := probeChannelTarget(ctx, target, testUserID)
		if err := model.SaveChannelProbeOutcome(outcome); err != nil {
			common.SysError(fmt.Sprintf(
				"save channel probe outcome failed: group=%s channel_id=%d model=%s err=%v",
				outcome.Group, outcome.ChannelID, outcome.ModelName, err,
			))
			saveFailures++
			continue
		}
	}
	finishSystemTaskHandler(task, runnerID, model.SystemTaskStatusSucceeded, map[string]any{
		"targets":       len(targets),
		"duration":      time.Since(started).Milliseconds(),
		"save_failures": saveFailures,
	}, nil)
}

func probeChannelTarget(ctx context.Context, target model.ChannelProbeTarget, testUserID int) model.ChannelProbeOutcome {
	started := time.Now()
	outcome := model.ChannelProbeOutcome{
		Group:     target.Group,
		ChannelID: target.ChannelID,
		ModelName: target.ModelName,
		ProbedAt:  common.GetTimestamp(),
	}

	channel, err := model.GetChannelById(target.ChannelID, true)
	if err != nil {
		outcome.LatencyMS = time.Since(started).Milliseconds()
		outcome.ErrorCode = "channel_not_found"
		outcome.ErrorMessage = err.Error()
		return outcome
	}

	probeCtx := ctx
	if probeCtx == nil {
		probeCtx = context.Background()
	}
	result := testChannelWithGroup(
		probeCtx,
		channel,
		testUserID,
		target.ModelName,
		"",
		shouldUseStreamForAutomaticChannelTest(channel),
		target.Group,
		true,
	)
	outcome.LatencyMS = time.Since(started).Milliseconds()
	outcome.Endpoint = result.endpoint
	outcome.UpstreamModelName = result.upstreamModelName
	if result.newAPIError == nil && result.localErr == nil {
		outcome.Success = true
		return outcome
	}
	if result.newAPIError != nil {
		outcome.StatusCode = result.newAPIError.StatusCode
		outcome.ErrorCode = string(result.newAPIError.GetErrorCode())
		outcome.ErrorMessage = common.LocalLogPreview(result.newAPIError.MaskSensitiveErrorWithStatusCode())
	} else {
		outcome.ErrorCode = "probe_failed"
		if result.localErr != nil {
			outcome.ErrorMessage = common.LocalLogPreview(result.localErr.Error())
		}
	}
	return outcome
}
