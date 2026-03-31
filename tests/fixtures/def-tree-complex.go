package sample

func entry() string {
	raw := loadConfig()
	parsed := parseConfig(raw)
	normalized := normalizeConfig(parsed)
	score := computeScore(normalized, 2)
	result := finalizeResult(score)
	audit(result)
	audit(result)
	return result
}

func loadConfig() string {
	return readEnv()
}

func readEnv() string {
	return sanitizeEnv("APP_MODE")
}

func sanitizeEnv(key string) string {
	return key
}

func parseConfig(raw string) string {
	if raw == "" {
		return defaultConfig()
	}
	return expandConfig(raw)
}

func defaultConfig() string {
	return "default"
}

func expandConfig(raw string) string {
	return raw + ":" + raw
}

func normalizeConfig(cfg string) string {
	compact := shrinkConfig(cfg)
	return compact
}

func shrinkConfig(cfg string) string {
	return cfg
}

func computeScore(cfg string, weight int) int {
	base := evaluate(cfg)
	weighted := applyWeight(base, weight)
	return combineScores(base, weighted)
}

func evaluate(cfg string) int {
	a := metricA(cfg)
	b := metricB(cfg)
	return add(a, b)
}

func metricA(cfg string) int {
	return lengthOf(cfg)
}

func metricB(cfg string) int {
	return lengthOf(cfg)
}

func lengthOf(cfg string) int {
	return len(cfg)
}

func applyWeight(value int, weight int) int {
	return multiply(value, weight)
}

func multiply(a int, b int) int {
	return a * b
}

func combineScores(a int, b int) int {
	return add(a, b)
}

func add(a int, b int) int {
	return a + b
}

func finalizeResult(value int) string {
	return formatResult(value)
}

func formatResult(value int) string {
	return "score:"
}

func audit(result string) string {
	return logResult(result)
}

func logResult(result string) string {
	return result
}
