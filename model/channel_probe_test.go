package model

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestBuildChannelProbeTargetsPreservesGroupsAndFiltersDisabled(t *testing.T) {
	abilities := []AbilityWithChannel{
		{Ability: Ability{Group: "default", Model: "model-a", ChannelId: 1, Enabled: true}},
		{Ability: Ability{Group: "vip", Model: "model-a", ChannelId: 1, Enabled: true}},
		{Ability: Ability{Group: "default", Model: "model-b", ChannelId: 2, Enabled: true}},
		{Ability: Ability{Group: "default", Model: "model-c", ChannelId: 3, Enabled: true}},
		{Ability: Ability{Group: "default", Model: "model-a", ChannelId: 1, Enabled: true}},
	}
	channels := map[int]*Channel{
		1: {Id: 1, Name: "Primary", Group: "default,vip", Status: common.ChannelStatusEnabled},
		2: {Id: 2, Name: "Disabled", Group: "default", Status: common.ChannelStatusManuallyDisabled},
		3: {Id: 3, Name: "Wrong group", Group: "vip", Status: common.ChannelStatusEnabled},
	}

	targets := buildChannelProbeTargets(abilities, channels)
	require.Len(t, targets, 2)
	assert.Equal(t, "default", targets[0].Group)
	assert.Equal(t, "model-a", targets[0].ModelName)
	assert.Equal(t, "vip", targets[1].Group)
	assert.Equal(t, "model-a", targets[1].ModelName)
}
