package model

import (
	"fmt"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
)

func cacheSetToken(token Token) error {
	// P0-6: Use key hash as Redis cache key (not plaintext key)
	keyHash := ComputeKeyHash(token.Key)
	token.Clean()
	err := common.RedisHSetObj(fmt.Sprintf("token:%s", keyHash), &token, time.Duration(common.RedisKeyCacheSeconds())*time.Second)
	if err != nil {
		return err
	}
	return nil
}

// cacheDeleteToken deletes a token from Redis cache.
// Accepts the plaintext key and computes the hash internally.
func cacheDeleteToken(key string) error {
	keyHash := ComputeKeyHash(key)
	err := common.RedisDelKey(fmt.Sprintf("token:%s", keyHash))
	if err != nil {
		return err
	}
	return nil
}

// cacheIncrTokenQuota increments a token's quota in Redis cache.
// Accepts the plaintext key and computes the hash internally.
func cacheIncrTokenQuota(key string, increment int64) error {
	keyHash := ComputeKeyHash(key)
	err := common.RedisHIncrBy(fmt.Sprintf("token:%s", keyHash), constant.TokenFiledRemainQuota, increment)
	if err != nil {
		return err
	}
	return nil
}

func cacheDecrTokenQuota(key string, decrement int64) error {
	return cacheIncrTokenQuota(key, -decrement)
}

func cacheSetTokenField(key string, field string, value string) error {
	keyHash := ComputeKeyHash(key)
	err := common.RedisHSetField(fmt.Sprintf("token:%s", keyHash), field, value)
	if err != nil {
		return err
	}
	return nil
}

// cacheGetTokenByKey retrieves a token from Redis cache by its plaintext key.
func cacheGetTokenByKey(key string) (*Token, error) {
	keyHash := ComputeKeyHash(key)
	if !common.RedisEnabled {
		return nil, fmt.Errorf("redis is not enabled")
	}
	var token Token
	err := common.RedisHGetObj(fmt.Sprintf("token:%s", keyHash), &token)
	if err != nil {
		return nil, err
	}
	return &token, nil
}
