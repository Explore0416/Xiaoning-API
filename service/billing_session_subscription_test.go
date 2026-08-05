package service

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/types"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func setupBillingSessionSubscriptionTest(t *testing.T) {
	t.Helper()
	previousDB := model.DB
	previousType := common.MainDatabaseType()
	previousRedis := common.RedisEnabled

	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(
		&model.User{},
		&model.Token{},
		&model.SubscriptionPlan{},
		&model.UserSubscription{},
		&model.SubscriptionPreConsumeRecord{},
	))
	model.DB = db
	common.SetMainDatabaseType(common.DatabaseTypeSQLite)
	common.RedisEnabled = false

	t.Cleanup(func() {
		model.DB = previousDB
		common.SetMainDatabaseType(previousType)
		common.RedisEnabled = previousRedis
	})
}

func seedBillingSessionToken(t *testing.T, userId int, remainQuota int) model.Token {
	t.Helper()
	token := model.Token{
		UserId:         userId,
		Key:            "billing-session-token",
		Name:           "test-token",
		Status:         common.TokenStatusEnabled,
		RemainQuota:    remainQuota,
		UnlimitedQuota: false,
	}
	require.NoError(t, model.DB.Create(&token).Error)
	return token
}

func TestSubscriptionBillingDoesNotRequireTokenRemainQuota(t *testing.T) {
	gin.SetMode(gin.TestMode)
	setupBillingSessionSubscriptionTest(t)

	const userId = 901
	now := model.GetDBTimestamp()
	token := seedBillingSessionToken(t, userId, 0)
	plan := model.SubscriptionPlan{Id: 9801, Title: "Unlimited", PriceAmount: 1, DurationUnit: model.SubscriptionDurationMonth, DurationValue: 1, TotalAmount: 0, QuotaResetPeriod: model.SubscriptionResetNever}
	require.NoError(t, model.DB.Create(&plan).Error)
	sub := model.UserSubscription{Id: 9802, UserId: userId, PlanId: plan.Id, AmountTotal: 0, AmountUsed: 0, StartTime: now - 60, EndTime: now + 3600, Status: "active"}
	require.NoError(t, model.DB.Create(&sub).Error)

	c, _ := gin.CreateTestContext(nil)
	info := &relaycommon.RelayInfo{
		RequestId:       "subscription-token-quota-bypass",
		UserId:          userId,
		TokenId:         token.Id,
		TokenKey:        token.Key,
		OriginModelName: "grok-4.5",
		UserSetting:     dto.UserSetting{BillingPreference: "subscription_only"},
	}

	session, apiErr := NewBillingSession(c, info, 5)
	require.Nil(t, apiErr)
	require.NotNil(t, session)
	assert.Equal(t, BillingSourceSubscription, info.BillingSource)
	assert.Equal(t, sub.Id, info.SubscriptionId)
	assert.EqualValues(t, 5, info.SubscriptionPreConsumed)
	assert.EqualValues(t, 0, getBillingSessionToken(t, token.Id).RemainQuota, "token quota is not adjusted by subscription billing")
	assert.EqualValues(t, 5, getBillingSessionSub(t, sub.Id).AmountUsed)

	require.NoError(t, session.Settle(12))
	assert.EqualValues(t, 0, getBillingSessionToken(t, token.Id).RemainQuota, "settlement still must not touch token quota")
	assert.EqualValues(t, 12, getBillingSessionSub(t, sub.Id).AmountUsed)
}

func TestWalletBillingStillRequiresTokenRemainQuota(t *testing.T) {
	gin.SetMode(gin.TestMode)
	setupBillingSessionSubscriptionTest(t)

	const userId = 902
	user := model.User{Id: userId, Username: "wallet-token-quota", Password: "password", Role: common.RoleCommonUser, Status: common.UserStatusEnabled, Quota: 100, Group: "default", AffCode: "wallet-token-quota"}
	require.NoError(t, model.DB.Create(&user).Error)
	token := seedBillingSessionToken(t, userId, 0)

	c, _ := gin.CreateTestContext(nil)
	info := &relaycommon.RelayInfo{
		RequestId:       "wallet-token-quota-required",
		UserId:          userId,
		TokenId:         token.Id,
		TokenKey:        token.Key,
		OriginModelName: "grok-4.5",
		UserSetting:     dto.UserSetting{BillingPreference: "wallet_only"},
	}

	session, apiErr := NewBillingSession(c, info, 5)

	assert.Nil(t, session)
	require.NotNil(t, apiErr)
	assert.Equal(t, types.ErrorCodePreConsumeTokenQuotaFailed, apiErr.GetErrorCode())
	assert.EqualValues(t, 0, getBillingSessionToken(t, token.Id).RemainQuota)
	assert.EqualValues(t, 100, getBillingSessionUser(t, userId).Quota)
}

func getBillingSessionToken(t *testing.T, id int) model.Token {
	t.Helper()
	var token model.Token
	require.NoError(t, model.DB.Where("id = ?", id).First(&token).Error)
	return token
}

func getBillingSessionSub(t *testing.T, id int) model.UserSubscription {
	t.Helper()
	var sub model.UserSubscription
	require.NoError(t, model.DB.Where("id = ?", id).First(&sub).Error)
	return sub
}

func getBillingSessionUser(t *testing.T, id int) model.User {
	t.Helper()
	var user model.User
	require.NoError(t, model.DB.Where("id = ?", id).First(&user).Error)
	return user
}
