CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =========================================
-- USERS TABLE
-- =========================================
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    national_id VARCHAR(20) NOT NULL,
    status VARCHAR(20) DEFAULT 'ACTIVE', -- ACTIVE / BLOCKED / SUSPENDED
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_users_email ON users(email);
CREATE UNIQUE INDEX idx_users_national_id ON users(national_id);


-- =========================================
-- DEVICES TABLE
-- =========================================
CREATE TABLE devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    device_id VARCHAR(255) NOT NULL,
    public_key TEXT NOT NULL,
    android_id VARCHAR(255),
    device_model TEXT,
    attestation_verified BOOLEAN DEFAULT FALSE,
    status VARCHAR(20) DEFAULT 'ACTIVE', -- ACTIVE / REVOKED
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_devices_user_id ON devices(user_id);
CREATE UNIQUE INDEX idx_devices_device_id ON devices(device_id);


-- =========================================
-- SIM HISTORY TABLE
-- =========================================
CREATE TABLE sim_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id UUID REFERENCES devices(id) ON DELETE CASCADE,
    phone_number VARCHAR(20) NOT NULL,
    imsi_hash VARCHAR(255),
    iccid_hash VARCHAR(255),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_sim_device_id ON sim_history(device_id);
CREATE INDEX idx_sim_phone_number ON sim_history(phone_number);


-- =========================================
-- AUDIT LOG TABLE
-- =========================================
CREATE TABLE audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    device_id UUID REFERENCES devices(id) ON DELETE SET NULL,
    event_type VARCHAR(100) NOT NULL, -- REGISTER_DEVICE / SIM_SWAP / BLOCK_USER / etc
    metadata JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_audit_user_id ON audit_log(user_id);
CREATE INDEX idx_audit_device_id ON audit_log(device_id);
CREATE INDEX idx_audit_event_type ON audit_log(event_type);