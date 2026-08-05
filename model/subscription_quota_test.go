package model

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func seedSubscriptionQuotaPlan(t *testing.T, plan *SubscriptionPlan) {
	t.Helper()
	require.NoError(t, DB.Create(plan).Error)
}

func seedSubscriptionQuotaSub(t *testing.T, sub *UserSubscription) {
	t.Helper()
	require.NoError(t, DB.Create(sub).Error)
}

func getSubscriptionQuotaSub(t *testing.T, id int) UserSubscription {
	t.Helper()
	var sub UserSubscription
	require.NoError(t, DB.Where("id = ?", id).First(&sub).Error)
	return sub
}

func countSubscriptionPreConsumeRecords(t *testing.T, requestId string) int64 {
	t.Helper()
	var count int64
	require.NoError(t, DB.Model(&SubscriptionPreConsumeRecord{}).Where("request_id = ?", requestId).Count(&count).Error)
	return count
}

func TestPreConsumeUserSubscriptionZeroTotalIsUnlimited(t *testing.T) {
	truncateTables(t)

	now := GetDBTimestamp()
	plan := &SubscriptionPlan{Id: 9601, Title: "Unlimited", PriceAmount: 1, DurationUnit: SubscriptionDurationMonth, DurationValue: 1, TotalAmount: 0, QuotaResetPeriod: SubscriptionResetNever}
	seedSubscriptionQuotaPlan(t, plan)
	seedSubscriptionQuotaSub(t, &UserSubscription{Id: 9701, UserId: 301, PlanId: plan.Id, AmountTotal: 0, AmountUsed: 0, StartTime: now - 60, EndTime: now + 3600, Status: "active"})

	result, err := PreConsumeUserSubscription("zero-total-request", 301, "test-model", 0, 1)

	require.NoError(t, err)
	require.NotNil(t, result)
	assert.Equal(t, 9701, result.UserSubscriptionId)
	assert.EqualValues(t, 1, result.PreConsumed)
	assert.EqualValues(t, 1, getSubscriptionQuotaSub(t, 9701).AmountUsed)
	assert.EqualValues(t, 1, countSubscriptionPreConsumeRecords(t, "zero-total-request"))
}

func TestPreConsumeUserSubscriptionPrefersEarlierZeroTotalUnlimitedSubscription(t *testing.T) {
	truncateTables(t)

	now := GetDBTimestamp()
	zeroPlan := &SubscriptionPlan{Id: 9602, Title: "Unlimited", PriceAmount: 1, DurationUnit: SubscriptionDurationMonth, DurationValue: 1, TotalAmount: 0, QuotaResetPeriod: SubscriptionResetNever}
	positivePlan := &SubscriptionPlan{Id: 9603, Title: "Positive", PriceAmount: 2, DurationUnit: SubscriptionDurationMonth, DurationValue: 1, TotalAmount: 100, QuotaResetPeriod: SubscriptionResetNever}
	seedSubscriptionQuotaPlan(t, zeroPlan)
	seedSubscriptionQuotaPlan(t, positivePlan)
	seedSubscriptionQuotaSub(t, &UserSubscription{Id: 9702, UserId: 302, PlanId: zeroPlan.Id, AmountTotal: 0, AmountUsed: 0, StartTime: now - 60, EndTime: now + 1800, Status: "active"})
	seedSubscriptionQuotaSub(t, &UserSubscription{Id: 9703, UserId: 302, PlanId: positivePlan.Id, AmountTotal: 100, AmountUsed: 0, StartTime: now - 60, EndTime: now + 3600, Status: "active"})

	result, err := PreConsumeUserSubscription("unlimited-preferred-request", 302, "test-model", 0, 10)

	require.NoError(t, err)
	require.NotNil(t, result)
	assert.Equal(t, 9702, result.UserSubscriptionId)
	assert.EqualValues(t, 10, result.PreConsumed)
	assert.EqualValues(t, 10, getSubscriptionQuotaSub(t, 9702).AmountUsed)
	assert.Zero(t, getSubscriptionQuotaSub(t, 9703).AmountUsed)
}

func TestPostConsumeUserSubscriptionDeltaAllowsPositiveDeltaForZeroTotal(t *testing.T) {
	truncateTables(t)

	now := GetDBTimestamp()
	plan := &SubscriptionPlan{Id: 9604, Title: "Unlimited", PriceAmount: 1, DurationUnit: SubscriptionDurationMonth, DurationValue: 1, TotalAmount: 0, QuotaResetPeriod: SubscriptionResetNever}
	seedSubscriptionQuotaPlan(t, plan)
	seedSubscriptionQuotaSub(t, &UserSubscription{Id: 9704, UserId: 303, PlanId: plan.Id, AmountTotal: 0, AmountUsed: 0, StartTime: now - 60, EndTime: now + 3600, Status: "active"})

	require.NoError(t, PostConsumeUserSubscriptionDelta(9704, 1000))
	assert.EqualValues(t, 1000, getSubscriptionQuotaSub(t, 9704).AmountUsed)
}

func TestPostConsumeUserSubscriptionDeltaAllowsRefundForZeroTotal(t *testing.T) {
	truncateTables(t)

	now := GetDBTimestamp()
	plan := &SubscriptionPlan{Id: 9605, Title: "Unlimited", PriceAmount: 1, DurationUnit: SubscriptionDurationMonth, DurationValue: 1, TotalAmount: 0, QuotaResetPeriod: SubscriptionResetNever}
	seedSubscriptionQuotaPlan(t, plan)
	seedSubscriptionQuotaSub(t, &UserSubscription{Id: 9705, UserId: 304, PlanId: plan.Id, AmountTotal: 0, AmountUsed: 5, StartTime: now - 60, EndTime: now + 3600, Status: "active"})

	require.NoError(t, PostConsumeUserSubscriptionDelta(9705, -3))
	assert.EqualValues(t, 2, getSubscriptionQuotaSub(t, 9705).AmountUsed)

	require.NoError(t, PostConsumeUserSubscriptionDelta(9705, -10))
	assert.Zero(t, getSubscriptionQuotaSub(t, 9705).AmountUsed)
}
