package helper

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	relayconstant "github.com/QuantumNous/new-api/relay/constant"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestToolTypeNormalizedForUpstream guards the upstream compatibility contract
// for tools[].type. ToolCallRequest.Type is a non-pointer string without
// omitempty, so a client that omits the field would otherwise be relayed as
// "type":"" — accepted by lenient upstreams (Tencent LKEAP) but rejected with a
// literal_error 400 by strict ones (LiteLLM/vLLM front gateways). That
// asymmetry hides the defect until a request fails over to another channel.
func TestToolTypeNormalizedForUpstream(t *testing.T) {
	gin.SetMode(gin.TestMode)

	newJSONContext := func(body string) *gin.Context {
		c, _ := gin.CreateTestContext(httptest.NewRecorder())
		c.Request = httptest.NewRequest(http.MethodPost, "/v1/chat/completions", bytes.NewBufferString(body))
		c.Request.Header.Set("Content-Type", "application/json")
		return c
	}

	const messages = `"messages":[{"role":"user","content":"hi"}]`

	testCases := []struct {
		name     string
		tools    string
		expected []string
	}{
		{
			name:     "omitted type defaults to function",
			tools:    `[{"function":{"name":"read_file"}}]`,
			expected: []string{dto.FunctionType},
		},
		{
			name:     "empty type defaults to function",
			tools:    `[{"type":"","function":{"name":"read_file"}}]`,
			expected: []string{dto.FunctionType},
		},
		{
			name:     "explicit type preserved",
			tools:    `[{"type":"function","function":{"name":"read_file"}}]`,
			expected: []string{dto.FunctionType},
		},
		{
			name:     "omitted type with custom payload defaults to custom",
			tools:    `[{"custom":{"name":"grammar"}}]`,
			expected: []string{dto.CustomType},
		},
		{
			name:     "normalization applies to every tool in the array",
			tools:    `[{"function":{"name":"a"}},{"type":"","function":{"name":"b"}},{"type":"function","function":{"name":"c"}}]`,
			expected: []string{dto.FunctionType, dto.FunctionType, dto.FunctionType},
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			c := newJSONContext(`{"model":"deepseek-v3.2",` + messages + `,"tools":` + tc.tools + `}`)

			request, err := GetAndValidateTextRequest(c, relayconstant.RelayModeChatCompletions)
			require.NoError(t, err)
			require.Len(t, request.Tools, len(tc.expected))

			for i, expectedType := range tc.expected {
				assert.Equal(t, expectedType, request.Tools[i].Type, "tools[%d].type", i)
			}

			body, err := common.Marshal(request)
			require.NoError(t, err)
			assert.NotContains(t, string(body), `"type":""`, "relayed payload must not carry an empty tool type")
		})
	}
}
