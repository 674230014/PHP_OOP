-- 1. สร้างฐานข้อมูล
CREATE DATABASE IF NOT EXISTS shipping_db
    DEFAULT CHARACTER SET utf8mb4
    DEFAULT COLLATE utf8mb4_unicode_ci;

USE shipping_db;

-- 2. ตารางเก็บข้อมูลพัสดุ (PACKAGES)
CREATE TABLE IF NOT EXISTS PACKAGES (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    weight_kg DECIMAL(10, 2) NOT NULL,
    width_cm DECIMAL(10, 2) NOT NULL,
    length_cm DECIMAL(10, 2) NOT NULL,
    height_cm DECIMAL(10, 2) NOT NULL,
    is_fragile BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
) ENGINE=InnoDB;

-- 3. ตารางเก็บข้อมูลผู้ให้บริการขนส่ง (SHIPPING_CARRIERS)
CREATE TABLE IF NOT EXISTS SHIPPING_CARRIERS (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    base_rate DECIMAL(10, 2) NOT NULL,
    rate_per_kg DECIMAL(10, 2) NOT NULL,
    fragile_fee DECIMAL(10, 2) DEFAULT 0.00 NOT NULL,
    volumetric_divisor DECIMAL(10, 2) DEFAULT 5000.00 NOT NULL,
    is_active BOOLEAN DEFAULT TRUE NOT NULL
) ENGINE=InnoDB;

-- 4. ตารางประวัติการคำนวณ (SHIPPING_CALCULATIONS)
CREATE TABLE IF NOT EXISTS SHIPPING_CALCULATIONS (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    package_id BIGINT NOT NULL,
    carrier_id BIGINT NOT NULL,
    chargeable_weight DECIMAL(10, 2) NOT NULL,
    calculated_cost DECIMAL(10, 2) NOT NULL,
    calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT fk_package FOREIGN KEY (package_id) REFERENCES PACKAGES(id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_carrier FOREIGN KEY (carrier_id) REFERENCES SHIPPING_CARRIERS(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

-- 5. เพิ่มข้อมูลบริษัทขนส่งเริ่มต้นสำหรับทดสอบ
INSERT INTO SHIPPING_CARRIERS (id, name, base_rate, rate_per_kg, fragile_fee, volumetric_divisor, is_active) 
VALUES
(1, 'FastExpress', 35.00, 10.00, 20.00, 5000.00, TRUE),
(2, 'BulkLogistics', 50.00, 8.00, 15.00, 6000.00, TRUE)
ON DUPLICATE KEY UPDATE name=VALUES(name);