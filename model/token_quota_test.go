package model

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestDecreaseTokenQuotaAllowsUnlimitedTokenWithoutRemainQuota(t *testing.T) {
	truncateTables(t)

	// Unlimited keys are commonly left at 0 or driven negative by past usage,
	// so the balance guard must not apply to them.
	token := Token{Id: 9901, UserId: 401, Key: "unlimited-no-remain", Name: "unlimited", RemainQuota: 0, UnlimitedQuota: true}
	require.NoError(t, DB.Create(&token).Error)

	require.NoError(t, decreaseTokenQuota(token.Id, 500))

	var updated Token
	require.NoError(t, DB.Where("id = ?", token.Id).First(&updated).Error)
	assert.Equal(t, -500, updated.RemainQuota)
	assert.Equal(t, 500, updated.UsedQuota)
}

func TestDecreaseTokenQuotaRejectsLimitedTokenWithoutEnoughQuota(t *testing.T) {
	truncateTables(t)

	token := Token{Id: 9902, UserId: 402, Key: "limited-not-enough", Name: "limited", RemainQuota: 100, UnlimitedQuota: false}
	require.NoError(t, DB.Create(&token).Error)

	err := decreaseTokenQuota(token.Id, 500)

	require.Error(t, err)
	assert.EqualError(t, err, "insufficient token quota")

	var updated Token
	require.NoError(t, DB.Where("id = ?", token.Id).First(&updated).Error)
	assert.Equal(t, 100, updated.RemainQuota)
	assert.Zero(t, updated.UsedQuota)
}
