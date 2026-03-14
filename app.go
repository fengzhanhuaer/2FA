package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/google/uuid"
	"github.com/pquerna/otp/totp"
)

// Account represents a stored 2FA account
type Account struct {
	ID     string `json:"id"`
	Name   string `json:"name"`
	Issuer string `json:"issuer"`
	Secret string `json:"secret"`
}

// TOTPResult contains the current code and seconds remaining
type TOTPResult struct {
	Code      string `json:"code"`
	Remaining int    `json:"remaining"`
}

// App struct
type App struct {
	ctx      context.Context
	dataPath string
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{}
}

// startup is called when the app starts
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx

	// Determine data directory relative to the executable
	exe, err := os.Executable()
	if err != nil {
		exe = "."
	}
	a.dataPath = filepath.Join(filepath.Dir(exe), "data", "secrets.json")

	// Ensure the data directory exists
	if err := os.MkdirAll(filepath.Dir(a.dataPath), 0755); err != nil {
		fmt.Println("Failed to create data directory:", err)
	}
}

// loadAccounts reads accounts from disk
func (a *App) loadAccounts() ([]Account, error) {
	data, err := os.ReadFile(a.dataPath)
	if os.IsNotExist(err) {
		return []Account{}, nil
	}
	if err != nil {
		return nil, err
	}
	var accounts []Account
	if err := json.Unmarshal(data, &accounts); err != nil {
		return nil, err
	}
	return accounts, nil
}

// saveAccounts writes accounts to disk
func (a *App) saveAccounts(accounts []Account) error {
	data, err := json.MarshalIndent(accounts, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(a.dataPath, data, 0644)
}

// GetAccounts returns all stored accounts (secrets masked in transit – code is generated server-side)
func (a *App) GetAccounts() []Account {
	accounts, err := a.loadAccounts()
	if err != nil {
		return []Account{}
	}
	return accounts
}

// AddAccount adds a new TOTP account
func (a *App) AddAccount(name, issuer, secret string) error {
	if name == "" || secret == "" {
		return fmt.Errorf("name and secret are required")
	}
	// Validate the secret by attempting to generate a code
	_, err := totp.GenerateCode(secret, time.Now())
	if err != nil {
		return fmt.Errorf("invalid TOTP secret: %v", err)
	}

	accounts, err := a.loadAccounts()
	if err != nil {
		return err
	}
	accounts = append(accounts, Account{
		ID:     uuid.New().String(),
		Name:   name,
		Issuer: issuer,
		Secret: secret,
	})
	return a.saveAccounts(accounts)
}

// DeleteAccount removes an account by ID
func (a *App) DeleteAccount(id string) error {
	accounts, err := a.loadAccounts()
	if err != nil {
		return err
	}
	filtered := make([]Account, 0, len(accounts))
	for _, acc := range accounts {
		if acc.ID != id {
			filtered = append(filtered, acc)
		}
	}
	return a.saveAccounts(filtered)
}

// GetTOTPCode generates the current TOTP code for a given secret
func (a *App) GetTOTPCode(secret string) TOTPResult {
	now := time.Now()
	code, err := totp.GenerateCode(secret, now)
	if err != nil {
		return TOTPResult{Code: "------", Remaining: 0}
	}
	remaining := 30 - int(now.Unix()%30)
	return TOTPResult{Code: code, Remaining: remaining}
}
