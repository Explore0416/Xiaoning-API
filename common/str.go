package common

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"unsafe"

	kitutil "github.com/QuantumNous/new-api/relaykit/relayconvert/kitutil"

	"github.com/samber/lo"
)

const LocalLogContentLimit = 2048

// LocalLogPreview limits log-only content unless debug logging is enabled.
func LocalLogPreview(content string) string {
	if DebugEnabled || len(content) <= LocalLogContentLimit {
		return content
	}
	return fmt.Sprintf("%s... [truncated, original_length=%d, limit=%d]", content[:LocalLogContentLimit], len(content), LocalLogContentLimit)
}

func GetStringIfEmpty(str string, defaultValue string) string {
	if str == "" {
		return defaultValue
	}
	return str
}

func GetRandomString(length int) string {
	if length <= 0 {
		return ""
	}
	return lo.RandomString(length, lo.AlphanumericCharset)
}

func MapToJsonStr(m map[string]any) string {
	bytes, err := json.Marshal(m)
	if err != nil {
		return ""
	}
	return string(bytes)
}

func StrToMap(str string) (map[string]any, error) {
	m := make(map[string]any)
	err := Unmarshal([]byte(str), &m)
	if err != nil {
		return nil, err
	}
	return m, nil
}

func StrToJsonArray(str string) ([]any, error) {
	var js []any
	err := json.Unmarshal([]byte(str), &js)
	if err != nil {
		return nil, err
	}
	return js, nil
}

func IsJsonArray(str string) bool {
	var js []any
	return json.Unmarshal([]byte(str), &js) == nil
}

func IsJsonObject(str string) bool {
	var js map[string]any
	return json.Unmarshal([]byte(str), &js) == nil
}

func String2Int(str string) int {
	num, err := strconv.Atoi(str)
	if err != nil {
		return 0
	}
	return num
}

func StringsContains(strs []string, str string) bool {
	return slices.Contains(strs, str)
}

// StringToByteSlice []byte only read, panic on append
func StringToByteSlice(s string) []byte {
	tmp1 := (*[2]uintptr)(unsafe.Pointer(&s))
	tmp2 := [3]uintptr{tmp1[0], tmp1[1], tmp1[1]}
	return *(*[]byte)(unsafe.Pointer(&tmp2))
}

func EncodeBase64(str string) string {
	return base64.StdEncoding.EncodeToString([]byte(str))
}

func GetJsonString(data any) string {
	if data == nil {
		return ""
	}
	b, _ := json.Marshal(data)
	return string(b)
}

// NormalizeBillingPreference clamps the billing preference to valid values.
func NormalizeBillingPreference(pref string) string {
	switch strings.TrimSpace(pref) {
	case "subscription_first", "wallet_first", "subscription_only", "wallet_only":
		return strings.TrimSpace(pref)
	default:
		return "subscription_first"
	}
}

// MaskEmail masks a user email to prevent PII leakage in logs
// Returns "***masked***" if email is empty, otherwise shows only the domain part
func MaskEmail(email string) string {
	if email == "" {
		return "***masked***"
	}

	// Find the @ symbol
	_, after, ok := strings.Cut(email, "@")
	if !ok {
		// No @ symbol found, return masked
		return "***masked***"
	}

	// Return only the domain part with @ symbol
	return "***@" + after
}

// MaskSensitiveInfo moved to the conversion kit (kitutil) because the types
// package error formatting depends on it; host callers keep this name.
func MaskSensitiveInfo(str string) string {
	return kitutil.MaskSensitiveInfo(str)
}

// sanitizePatterns chains regex replacements to strip credentials from log messages.
var sanitizePatterns = []*regexp.Regexp{
	// Bearer tokens: Bearer sk-xxxxx, Bearer eyJhbG...
	regexp.MustCompile(`(?i)(bearer\s+)[A-Za-z0-9_\-.]{20,}`),
	// x-api-key header values
	regexp.MustCompile(`(?i)(x-api-key[:\s]+)[A-Za-z0-9_\-.]{16,}`),
	// sk- prefixed keys (OpenAI-style)
	regexp.MustCompile(`\b(sk-[A-Za-z0-9]{20,})\b`),
	// key- prefixed keys (Azure-style)
	regexp.MustCompile(`\b(key-[A-Za-z0-9]{20,})\b`),
	// Generic api_key= or apikey= URL parameters
	regexp.MustCompile(`(?i)(api[_-]?key=)[^\s&]{8,}`),
	// Password in URL: ://user:password@host
	regexp.MustCompile(`(://[^:]+:)[^@\s]{3,}(@)`),
	// password= or passwd= or secret= or token= in query strings
	regexp.MustCompile(`(?i)(password|passwd|secret|token=)[^\s&]{3,}`),
	// AWS secret access keys
	regexp.MustCompile(`(?i)(secret[_\s]*access[_\s]*key[:\s]+)[A-Za-z0-9/+=]{30,}`),
	// Generic long hex tokens that look like keys (64+ hex chars, must contain at least 2 distinct characters)
	regexp.MustCompile(`\b([a-f0-9]{64,})\b`),
}

// hasMixedChars returns true if s contains at least 2 distinct characters.
func hasMixedChars(s string) bool {
	if len(s) < 2 {
		return false
	}
	first := s[0]
	for i := 1; i < len(s); i++ {
		if s[i] != first {
			return true
		}
	}
	return false
}

// SanitizeForLog applies comprehensive credential redaction to log messages.
func SanitizeForLog(msg string) string {
	for _, re := range sanitizePatterns {
		msg = re.ReplaceAllStringFunc(msg, func(match string) string {
			if !hasMixedChars(match) {
				return match
			}
			for _, sub := range re.FindStringSubmatch(match) {
				if sub != "" && sub != match {
					return sub + "***"
				}
			}
			return "***"
		})
	}
	return msg
}
