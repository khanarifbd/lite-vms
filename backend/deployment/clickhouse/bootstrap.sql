CREATE DATABASE IF NOT EXISTS bnvp_tracking;

CREATE TABLE IF NOT EXISTS bnvp_tracking.vehicle_position_history
(
    packet_id String,
    vehicle_id UUID,
    provider_id UUID,
    source_id UUID,
    device_id UUID,
    assignment_id UUID,
    registration_number LowCardinality(String),
    imei String,
    dt_tracker_original String,
    dt_provider_received_original String,
    recorded_at DateTime64(3, 'UTC'),
    received_at DateTime64(3, 'UTC'),
    latitude Float64,
    longitude Float64,
    speed_kph Float32,
    heading Nullable(Float32),
    altitude_m Nullable(Float32),
    ignition Nullable(Bool),
    loc_valid Bool,
    protocol LowCardinality(String),
    net_protocol LowCardinality(String),
    ip_address String,
    port Nullable(UInt16),
    event_name LowCardinality(String),
    params_json String,
    raw_payload_json String,
    ingested_at DateTime64(3, 'UTC')
)
ENGINE = ReplacingMergeTree(ingested_at)
PARTITION BY toYYYYMM(received_at)
ORDER BY (vehicle_id, received_at, packet_id)
TTL received_at + INTERVAL 5 YEAR DELETE
SETTINGS index_granularity = 8192;

-- Existing installations are upgraded safely when this file is re-run.
ALTER TABLE bnvp_tracking.vehicle_position_history
    ADD COLUMN IF NOT EXISTS dt_tracker_original String AFTER imei;

ALTER TABLE bnvp_tracking.vehicle_position_history
    ADD COLUMN IF NOT EXISTS dt_provider_received_original String AFTER dt_tracker_original;
