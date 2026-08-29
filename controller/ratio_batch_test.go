package controller

import (
	"math"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestRatioBatchMatcher(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		match   RatioBatchMatch
		model   string
		expects bool
	}{
		{name: "prefix", match: RatioBatchMatch{Type: "prefix", Pattern: "gpt-4o"}, model: "gpt-4o-mini", expects: true},
		{name: "suffix", match: RatioBatchMatch{Type: "suffix", Pattern: "-latest"}, model: "claude-3-latest", expects: true},
		{name: "contains", match: RatioBatchMatch{Type: "contains", Pattern: "sonnet"}, model: "claude-sonnet-4", expects: true},
		{name: "exact", match: RatioBatchMatch{Type: "exact", Pattern: "gpt-4o"}, model: "gpt-4o-mini", expects: false},
		{name: "regex", match: RatioBatchMatch{Type: "regex", Pattern: `^gemini-.*-flash$`}, model: "gemini-2.0-flash", expects: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			matcher, err := ratioBatchMatcher(tt.match)
			require.NoError(t, err)
			assert.Equal(t, tt.expects, matcher(tt.model))
		})
	}
}

func TestRatioBatchMatcherRejectsInvalidPatterns(t *testing.T) {
	t.Parallel()

	_, err := ratioBatchMatcher(RatioBatchMatch{Type: "regex", Pattern: "["})
	require.Error(t, err)

	_, err = ratioBatchMatcher(RatioBatchMatch{Type: "unknown", Pattern: "gpt"})
	require.Error(t, err)

	_, err = ratioBatchMatcher(RatioBatchMatch{Type: "prefix", Pattern: ""})
	require.Error(t, err)
}

func TestIsFiniteNonNegative(t *testing.T) {
	t.Parallel()

	assert.True(t, isFiniteNonNegative(0))
	assert.True(t, isFiniteNonNegative(1.5))
	assert.False(t, isFiniteNonNegative(-0.01))
	assert.False(t, isFiniteNonNegative(math.NaN()))
	assert.False(t, isFiniteNonNegative(math.Inf(1)))
}
