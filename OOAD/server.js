const express = require('express');
const mysql = require('mysql2/promise');

const app = express();
app.use(express.json());

// 1. ตั้งค่าการเชื่อมต่อ MySQL
const dbConfig = {
    host: 'localhost',
    user: 'root',
    password: '', // ใส่รหัสผ่าน MySQL ของคุณที่นี่ (ถ้ามี)
    database: 'shipping_db'
};

const pool = mysql.createPool(dbConfig);

// 2. ฟังก์ชันคำนวณค่าจัดส่งตาม Business Logic
function calculateShipping(weightKg, widthCm, lengthCm, heightCm, isFragile, carrier) {
    // คำนวณน้ำหนักจากปริมาตร = (กว้าง * ยาว * สูง) / volumetric_divisor
    const volumetricWeight = (widthCm * lengthCm * heightCm) / parseFloat(carrier.volumetric_divisor);
    
    // หา Chargeable Weight (เลือกค่าที่มากที่สุดระหว่าง น้ำหนักจริง กับ น้ำหนักปริมาตร)
    const chargeableWeight = Math.max(weightKg, volumetricWeight);
    
    // คำนวณราคาสุทธิ = base_rate + (chargeable_weight * rate_per_kg) + (fragile_fee ถ้าเปราะบาง)
    let calculatedCost = parseFloat(carrier.base_rate) + (chargeableWeight * parseFloat(carrier.rate_per_kg));
    if (isFragile) {
        calculatedCost += parseFloat(carrier.fragile_fee);
    }

    return {
        chargeableWeight: Number(chargeableWeight.toFixed(2)),
        calculatedCost: Number(calculatedCost.toFixed(2))
    };
}

// 3. REST API: ดึงรายชื่อบริษัทขนส่ง
app.get('/api/carriers', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM SHIPPING_CARRIERS WHERE is_active = TRUE');
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 4. REST API: บันทึกพัสดุ คำนวณราคา และลงตาราง SHIPPING_CALCULATIONS
app.post('/api/calculate', async (req, res) => {
    const { weight_kg, width_cm, length_cm, height_cm, is_fragile, carrier_id } = req.body;

    try {
        // ดึงข้อมูลบริษัทขนส่งที่เลือก
        const [carriers] = await pool.query('SELECT * FROM SHIPPING_CARRIERS WHERE id = ?', [carrier_id]);
        if (carriers.length === 0) {
            return res.status(404).json({ success: false, message: 'ไม่พบข้อมูลขนส่ง' });
        }
        const carrier = carriers[0];

        // บันทึกข้อมูลลงตาราง PACKAGES
        const [pkgResult] = await pool.query(
            'INSERT INTO PACKAGES (weight_kg, width_cm, length_cm, height_cm, is_fragile) VALUES (?, ?, ?, ?, ?)',
            [weight_kg, width_cm, length_cm, height_cm, is_fragile]
        );
        const packageId = pkgResult.insertId;

        // คำนวณราคา
        const result = calculateShipping(
            parseFloat(weight_kg),
            parseFloat(width_cm),
            parseFloat(length_cm),
            parseFloat(height_cm),
            Boolean(is_fragile),
            carrier
        );

        // บันทึกผลลัพธ์ลงตาราง SHIPPING_CALCULATIONS
        const [calcResult] = await pool.query(
            'INSERT INTO SHIPPING_CALCULATIONS (package_id, carrier_id, chargeable_weight, calculated_cost) VALUES (?, ?, ?, ?)',
            [packageId, carrier_id, result.chargeableWeight, result.calculatedCost]
        );

        res.json({
            success: true,
            data: {
                calculation_id: calcResult.insertId,
                package_id: packageId,
                carrier_name: carrier.name,
                chargeable_weight: result.chargeableWeight,
                calculated_cost: result.calculatedCost
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 5. REST API: ดึงประวัติการคำนวณทั้งหมด
app.get('/api/history', async (req, res) => {
    try {
        const query = `
            SELECT 
                sc.id,
                p.id AS package_id,
                p.weight_kg,
                p.width_cm, p.length_cm, p.height_cm,
                p.is_fragile,
                c.name AS carrier_name,
                sc.chargeable_weight,
                sc.calculated_cost,
                sc.calculated_at
            FROM SHIPPING_CALCULATIONS sc
            JOIN PACKAGES p ON sc.package_id = p.id
            JOIN SHIPPING_CARRIERS c ON sc.carrier_id = c.id
            ORDER BY sc.calculated_at DESC
        `;
        const [rows] = await pool.query(query);
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 6. หน้าจอ Web UI สำหรับใช้งาน
app.get('/', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="th">
    <head>
        <meta charset="UTF-8">
        <title>ระบบคำนวณค่าจัดส่งพัสดุ</title>
        <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #f4f6f9; margin: 0; padding: 20px; }
            .container { max-width: 900px; margin: 0 auto; background: white; padding: 25px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            h2 { color: #333; border-bottom: 2px solid #4A90E2; padding-bottom: 10px; }
            .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px; }
            label { display: block; font-weight: bold; margin-bottom: 5px; color: #555; }
            input, select { width: 100%; padding: 10px; border: 1fr solid #ccc; border-radius: 4px; box-sizing: border-box; }
            .checkbox-group { grid-column: span 2; display: flex; align-items: center; gap: 10px; }
            .checkbox-group input { width: auto; }
            button { width: 100%; background: #4A90E2; color: white; border: none; padding: 12px; font-size: 16px; border-radius: 4px; cursor: pointer; font-weight: bold; }
            button:hover { background: #357ABD; }
            .result-box { margin-top: 20px; padding: 15px; background: #eef7fe; border-left: 5px solid #4A90E2; display: none; }
            table { width: 100%; border-collapse: collapse; margin-top: 25px; }
            th, td { border: 1px solid #ddd; padding: 10px; text-align: center; }
            th { background: #f8f9fa; color: #333; }
        </style>
    </head>
    <body>
        <div class="container">
            <h2>📦 คำนวณค่าจัดส่งพัสดุ</h2>
            <form id="calcForm">
                <div class="form-grid">
                    <div>
                        <label>น้ำหนักจริง (kg):</label>
                        <input type="number" step="0.01" id="weight_kg" value="2.5" required>
                    </div>
                    <div>
                        <label>ผู้ให้บริการขนส่ง:</label>
                        <select id="carrier_id" required><option value="">กำลังโหลด...</option></select>
                    </div>
                    <div>
                        <label>ความกว้าง (cm):</label>
                        <input type="number" step="0.01" id="width_cm" value="30" required>
                    </div>
                    <div>
                        <label>ความยาว (cm):</label>
                        <input type="number" step="0.01" id="length_cm" value="40" required>
                    </div>
                    <div>
                        <label>ความสูง (cm):</label>
                        <input type="number" step="0.01" id="height_cm" value="20" required>
                    </div>
                    <div class="checkbox-group">
                        <input type="checkbox" id="is_fragile" checked>
                        <label for="is_fragile">พัสดุแตกหักง่าย (มีค่าธรรมเนียมพิเศษ)</label>
                    </div>
                </div>
                <button type="submit">คำนวณและบันทึกข้อมูล</button>
            </form>

            <div id="resultBox" class="result-box">
                <h3>ผลการคำนวณ:</h3>
                <p><strong>บริษัทขนส่ง:</strong> <span id="resCarrier"></span></p>
                <p><strong>น้ำหนักที่ใช้คิดเงิน:</strong> <span id="resWeight"></span> kg</p>
                <p><strong>ค่าจัดส่งสุทธิ:</strong> <span id="resCost" style="color: #d9534f; font-size: 20px; font-weight: bold;"></span> บาท</p>
            </div>

            <h2>📊 ประวัติการคำนวณล่าสุด</h2>
            <table>
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>พัสดุ ID</th>
                        <th>น้ำหนักจริง</th>
                        <th>บริษัทขนส่ง</th>
                        <th>น้ำหนักคิดเงิน</th>
                        <th>ค่าจัดส่ง (บาท)</th>
                        <th>เวลาที่คำนวณ</th>
                    </tr>
                </thead>
                <tbody id="historyTable"></tbody>
            </table>
        </div>

        <script>
            // โหลดรายชื่อขนส่ง
            async function loadCarriers() {
                const res = await fetch('/api/carriers');
                const result = await res.json();
                const select = document.getElementById('carrier_id');
                select.innerHTML = result.data.map(c => \`<option value="\${c.id}">\${c.name} (เริ่มต้น \${c.base_rate} บ.)</option>\`).join('');
            }

            // โหลดประวัติการคำนวณ
            async function loadHistory() {
                const res = await fetch('/api/history');
                const result = await res.json();
                const tbody = document.getElementById('historyTable');
                tbody.innerHTML = result.data.map(h => \`
                    <tr>
                        <td>\${h.id}</td>
                        <td>\${h.package_id}</td>
                        <td>\${h.weight_kg} kg</td>
                        <td>\${h.carrier_name}</td>
                        <td>\${h.chargeable_weight} kg</td>
                        <td><strong>\${h.calculated_cost}</strong></td>
                        <td>\${new Date(h.calculated_at).toLocaleString('th-TH')}</td>
                    </tr>
                \`).join('');
            }

            // ส่งข้อมูลคำนวณ
            document.getElementById('calcForm').addEventListener('submit', async (e) => {
                e.preventDefault();
                const payload = {
                    weight_kg: document.getElementById('weight_kg').value,
                    width_cm: document.getElementById('width_cm').value,
                    length_cm: document.getElementById('length_cm').value,
                    height_cm: document.getElementById('height_cm').value,
                    is_fragile: document.getElementById('is_fragile').checked,
                    carrier_id: document.getElementById('carrier_id').value
                };

                const res = await fetch('/api/calculate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const result = await res.json();

                if (result.success) {
                    document.getElementById('resCarrier').innerText = result.data.carrier_name;
                    document.getElementById('resWeight').innerText = result.data.chargeable_weight;
                    document.getElementById('resCost').innerText = result.data.calculated_cost;
                    document.getElementById('resultBox').style.display = 'block';
                    loadHistory();
                }
            });

            loadCarriers();
            loadHistory();
        </script>
    </body>
    </html>
    `);
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`🚀 ระบบพร้อมใช้งานที่: http://localhost:${PORT}`);
});