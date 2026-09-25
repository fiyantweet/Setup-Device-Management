// ==========================================
// KONEKSI SUPABASE CLOUD
// ==========================================
const SUPABASE_URL = 'https://xnfdvmxbklqelwvxzygp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhuZmR2bXhia2xxZWx3dnh6eWdwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk2NDgwMzQsImV4cCI6MjEwNTIyNDAzNH0.c6rY_GA0vBjGMnUQc9xDPKSYC1sB1fNiYZU1kVbKt2Q';

let supabaseClient = null;
try {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} catch (e) {
    console.error("Gagal menginisialisasi Supabase:", e);
}

let currentUser = null;

// Cek Sesi Persisten saat Browser Dimuat / Di-refresh
window.addEventListener('DOMContentLoaded', () => {
    const savedUser = localStorage.getItem('autopilot_current_user');
    if (savedUser) {
        currentUser = JSON.parse(savedUser);
        document.getElementById('auth-section').classList.add('hidden');
        document.getElementById('app-section').classList.remove('hidden');
        initApp();
    }

    setupEnterListeners();
});

function setupEnterListeners() {
    const lUser = document.getElementById('login-user');
    const lPass = document.getElementById('login-pass');
    const mCode = document.getElementById('mfa-code');
    const rUser = document.getElementById('reset-user');
    const rPass = document.getElementById('reset-pass');
    const sInput = document.getElementById('search-input');

    if(lUser) lUser.addEventListener('keypress', e => { if(e.key === 'Enter') lPass.focus(); });
    if(lPass) lPass.addEventListener('keypress', e => { if(e.key === 'Enter') handleLogin(); });
    if(mCode) mCode.addEventListener('keypress', e => { if(e.key === 'Enter') handle2FA(); });
    if(rUser) rUser.addEventListener('keypress', e => { if(e.key === 'Enter') rPass.focus(); });
    if(rPass) rPass.addEventListener('keypress', e => { if(e.key === 'Enter') handleReset(); });
    if(sInput) sInput.addEventListener('keypress', e => { if(e.key === 'Enter') searchDevice(); });
}

// ==========================================
// PENCATAT AKTIFITAS (ACTIVITY LOGS)
// ==========================================
async function logActivity(activityDesc) {
    if (!currentUser) return;
    const nowStr = new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'medium' });
    try {
        await supabaseClient.from('activity_logs').insert([{
            username: currentUser.username,
            activity: activityDesc,
            created_at: nowStr
        }]);
    } catch (err) {
        console.error("Gagal mencatat log aktifitas:", err);
    }
}

// ==========================================
// 1. AUTENTIKASI & LOGIN SISTEM
// ==========================================
function toggleAuth(view) {
    document.getElementById('login-card').classList.add('hidden');
    document.getElementById('mfa-card').classList.add('hidden');
    document.getElementById('reset-card').classList.add('hidden');
    document.getElementById(`${view}-card`).classList.remove('hidden');
}

function fillDemoAccount() {
    document.getElementById('login-user').value = 'admin';
    document.getElementById('login-pass').value = 'admin123';
    document.getElementById('login-pass').focus();
}

async function handleLogin() {
    const user = document.getElementById('login-user').value.trim();
    const pass = document.getElementById('login-pass').value.trim();
    
    if (!user || !pass) {
        alert("Username dan Password wajib diisi!");
        return;
    }

    if (!supabaseClient || SUPABASE_URL.includes('ISI_DENGAN')) {
        alert("Konfigurasi Supabase URL dan Anon Key belum diisi di file script.js!");
        return;
    }

    try {
        const { data: users, error } = await supabaseClient
            .from('app_users')
            .select('*')
            .eq('username', user)
            .eq('password', pass);

        if (error) {
            alert("Database Error: " + error.message);
            return;
        }

        if (!users || users.length === 0) {
            alert("Login Gagal: Username atau Password salah!");
            return;
        }

        currentUser = users[0];
        toggleAuth('mfa');
        prepareAuthenticator(currentUser);
        setTimeout(() => document.getElementById('mfa-code').focus(), 100);

    } catch (err) {
        console.error("Login Exception:", err);
        alert("Terjadi kesalahan koneksi ke server Supabase.");
    }
}

function prepareAuthenticator(account) {
    const qrContainer = document.getElementById('qr-container');
    const qrDiv = document.getElementById('qrcode');
    const instruction = document.getElementById('mfa-instruction');
    qrDiv.innerHTML = ''; 

    if (!account.is_2fa_setup) {
        qrContainer.classList.remove('hidden');
        instruction.innerText = "SETUP PERTAMA: Buka Authenticator dan Scan Barcode ini.";
        const appName = "AutoPilot_Cloud";
        const otpUrl = `otpauth://totp/${appName}:${account.username}?secret=JBSWY3DPEHPK3PXP&issuer=${appName}`;
        new QRCode(qrDiv, { text: otpUrl, width: 140, height: 140, colorDark: "#000", colorLight: "#ffffff" });
    } else {
        qrContainer.classList.add('hidden');
        instruction.innerText = "Masukkan 6 digit kode dari aplikasi Authenticator Anda.";
    }
}

async function handle2FA() {
    const code = document.getElementById('mfa-code').value.trim();
    
    if (code.length === 6 && !isNaN(code)) {
        if (!currentUser.is_2fa_setup) {
            await supabaseClient
                .from('app_users')
                .update({ is_2fa_setup: true })
                .eq('id', currentUser.id);
            currentUser.is_2fa_setup = true;
        }

        // Catat riwayat login berhasil ke activity_logs
        await logActivity("Berhasil Login ke sistem (Verifikasi 2FA Sukses)");

        // Simpan sesi ke localStorage agar tetap login saat browser di-refresh
        localStorage.setItem('autopilot_current_user', JSON.stringify(currentUser));

        document.getElementById('auth-section').classList.add('hidden');
        document.getElementById('app-section').classList.remove('hidden');
        initApp();
    } else {
        alert("Kode 2FA tidak valid! Harap masukkan 6 digit angka.");
    }
}

async function handleReset() {
    const user = document.getElementById('reset-user').value.trim();
    const newPass = document.getElementById('reset-pass').value.trim();
    
    if(!user || !newPass) return alert("Harap isi Username dan Password Baru!");

    const { data, error } = await supabaseClient
        .from('app_users')
        .update({ password: newPass })
        .eq('username', user)
        .select();

    if (error || !data || data.length === 0) {
        alert("Gagal Reset: Username tidak ditemukan di database.");
    } else {
        alert("Reset Password Berhasil! Silakan login kembali.");
        toggleAuth('login');
    }
}

function logout() {
    logActivity("Logout dari sistem");
    currentUser = null;
    localStorage.removeItem('autopilot_current_user'); // Hapus sesi
    document.getElementById('app-section').classList.add('hidden');
    document.getElementById('auth-section').classList.remove('hidden');
    document.querySelectorAll('.input-form').forEach(el => el.value = '');
    toggleAuth('login');
}

// ==========================================
// 2. INISIALISASI & DASHBOARD
// ==========================================
async function initApp() {
    if(!currentUser) return;
    document.getElementById('login-role-badge').innerText = `[ ${currentUser.role} ]`;

    if(currentUser.role === 'Admin') {
        document.getElementById('tab-btn-admin').style.display = 'inline-block';
        renderUsers();
    } else {
        document.getElementById('tab-btn-admin').style.display = 'none';
        switchTab('device');
    }

    await renderDevices();
}

function switchTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    document.getElementById(`tab-${tabName}`).classList.add('active');
    
    // Temukan tombol tab yang sesuai
    const buttons = document.querySelectorAll('.tab-btn');
    buttons.forEach(btn => {
        if(tabName === 'device' && btn.innerText.includes('Deploy Device')) btn.classList.add('active');
        if(tabName === 'activity' && btn.innerText.includes('Riwayat Aktifitas')) btn.classList.add('active');
        if(tabName === 'admin' && btn.innerText.includes('Pengaturan User')) btn.classList.add('active');
    });

    if (tabName === 'activity') {
        renderActivityLogs();
    }
}

async function updateDashboardStats() {
    const { data: devices } = await supabaseClient.from('devices').select('*');
    if(!devices) return;
    
    document.getElementById('stat-total').innerText = devices.length;
    document.getElementById('stat-belum').innerText = devices.filter(d => d.status === 'Belum di setup').length;
    document.getElementById('stat-progress').innerText = devices.filter(d => d.status === 'On progress').length;
    document.getElementById('stat-setup').innerText = devices.filter(d => d.status === 'Done setup').length;
    document.getElementById('stat-deploy').innerText = devices.filter(d => d.status === 'Done deploy user').length;
}

function setStatFilter(status) {
    document.getElementById('filter-status-select').value = status;
    renderDevices();
}

function formatTanggalIndo(dateString) {
    if (!dateString) return '-';
    const parts = dateString.split('-');
    if (parts.length !== 3) return dateString;
    const [year, month, day] = parts;
    const d = new Date(year, month - 1, day);
    return d.toLocaleDateString('id-ID', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });
}

// ==========================================
// 3. CRUD DEVICES, DUPLICATE DETECTION & TEAM
// ==========================================
function getStatusBadge(status) {
    if(status === 'Belum di setup') return `<span class="badge badge-belum">${status}</span>`;
    if(status === 'On progress') return `<span class="badge badge-progress">${status}</span>`;
    if(status === 'Done setup') return `<span class="badge badge-setup">${status}</span>`;
    if(status === 'Done deploy user') return `<span class="badge badge-deploy">${status}</span>`;
    return status;
}

async function renderDevices() {
    const { data: devices, error } = await supabaseClient.from('devices').select('*');
    if (error) { console.error(error); return; }

    const tbody = document.getElementById('table-device');
    tbody.innerHTML = '';

    let list = devices || [];

    // Hitung kemunculan Serial Number untuk Conditional Formatting (Duplicate Values)
    const snCount = {};
    list.forEach(d => {
        if(d.sn) {
            const cleanSn = d.sn.trim().toLowerCase();
            snCount[cleanSn] = (snCount[cleanSn] || 0) + 1;
        }
    });

    const selectedStatus = document.getElementById('filter-status-select').value;
    if (selectedStatus !== 'All') {
        list = list.filter(d => d.status === selectedStatus);
    }

    const searchVal = document.getElementById('search-input').value.toLowerCase().trim();
    if (searchVal) {
        list = list.filter(d => 
            (d.nama && d.nama.toLowerCase().includes(searchVal)) || 
            (d.sn && d.sn.toLowerCase().includes(searchVal)) ||
            (d.email && d.email.toLowerCase().includes(searchVal))
        );
    }

    const sortVal = document.getElementById('sort-date-select').value;
    list.sort((a, b) => {
        const dateA = a.tanggal || '';
        const dateB = b.tanggal || '';
        if (sortVal === 'oldest') {
            return dateA.localeCompare(dateB);
        } else {
            return dateB.localeCompare(dateA);
        }
    });

    list.forEach(d => {
        const isDuplicate = d.sn && snCount[d.sn.trim().toLowerCase()] > 1;
        const rowClass = isDuplicate ? 'duplicate-highlight' : '';
        const duplicateBadge = isDuplicate ? `<span class="duplicate-badge" title="Data/SN Ganda terdeteksi!">DUPLIKAT</span>` : '';

        tbody.innerHTML += `
            <tr class="${rowClass}">
                <td>${d.nama || ''}</td>
                <td>${d.sn || ''} ${duplicateBadge}</td>
                <td>${d.email || ''}</td>
                <td><strong>${d.team || 'Afin'}</strong></td>
                <td>${d.alamat || ''}</td>
                <td><strong>${formatTanggalIndo(d.tanggal)}</strong></td>
                <td>${getStatusBadge(d.status)}</td>
                <td>
                    <div class="history-container">
                        ${d.history || 'Belum ada riwayat update.'}
                    </div>
                </td>
                <td>
                    <button class="btn btn-warning" style="padding:5px 8px; font-size:11px;" onclick="editDevice(${d.id})">Edit</button>
                    <button class="btn btn-clear" style="padding:5px 8px; font-size:11px;" onclick="clearHistory(${d.id})" title="Reset Riwayat">Clear</button>
                    <button class="btn btn-danger" style="padding:5px 8px; font-size:11px;" onclick="deleteDevice(${d.id})">Hapus</button>
                </td>
            </tr>
        `;
    });
    updateDashboardStats();
}

async function searchDevice() {
    renderDevices();
}

async function saveDevice() {
    const id = document.getElementById('dev-id').value;
    const nama = document.getElementById('dev-nama').value.trim();
    const sn = document.getElementById('dev-sn').value.trim();
    const email = document.getElementById('dev-email').value.trim();
    const team = document.getElementById('dev-team').value;
    const alamat = document.getElementById('dev-alamat').value.trim();
    const tanggal = document.getElementById('dev-tgl').value;
    const status = document.getElementById('dev-status').value;

    if (!nama || !sn) {
        alert("Nama User dan Serial Number wajib diisi!");
        return;
    }

    // Cek Duplicate Values di Database sebelum simpan
    const { data: allDevices } = await supabaseClient.from('devices').select('*');
    if (allDevices) {
        const duplicateFound = allDevices.find(d => d.sn && d.sn.toLowerCase() === sn.toLowerCase() && d.id != id);
        if (duplicateFound) {
            alert(`PÈRINGATAN DUPLIKAT! Serial Number "${sn}" sudah terdaftar atas nama user "${duplicateFound.nama}". Mohon periksa kembali.`);
        }
    }

    const nowStr = new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });

    if (id) {
        const { data: oldData } = await supabaseClient.from('devices').select('history, status, nama').eq('id', id).single();
        let historyLog = oldData?.history || '';
        
        if (oldData?.status !== status) {
            const newUpdate = `• Status diubah ke <strong>${status}</strong> (${nowStr})`;
            historyLog = historyLog ? newUpdate + '<br>' + historyLog : newUpdate;
        }

        await supabaseClient.from('devices').update({
            nama, sn, email, team, alamat, tanggal, status, history: historyLog
        }).eq('id', id);

        logActivity(`Mengubah data device milik user: ${nama} (SN: ${sn})`);
    } else {
        const newHistory = `• Data dibuat oleh ${currentUser.username} (${nowStr})`;
        await supabaseClient.from('devices').insert([{
            nama, sn, email, team, alamat, tanggal, status, history: newHistory
        }]);

        logActivity(`Menambahkan device baru untuk user: ${nama} (Team: ${team})`);
    }
    
    closeModal('modal-device');
    renderDevices();
}

async function editDevice(id) {
    const { data } = await supabaseClient.from('devices').select('*').eq('id', id).single();
    if(data) {
        document.getElementById('title-device').innerText = 'Edit Status & Data Deploy';
        document.getElementById('dev-id').value = data.id;
        document.getElementById('dev-nama').value = data.nama;
        document.getElementById('dev-sn').value = data.sn;
        document.getElementById('dev-email').value = data.email;
        document.getElementById('dev-team').value = data.team || 'Afin';
        document.getElementById('dev-alamat').value = data.alamat;
        document.getElementById('dev-tgl').value = data.tanggal;
        document.getElementById('dev-status').value = data.status;
        document.getElementById('modal-device').classList.remove('hidden');
    }
}

async function clearHistory(id) {
    if(confirm("Apakah Anda yakin ingin mereset/menghapus Riwayat Status Update untuk device ini?")) {
        const nowStr = new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
        await supabaseClient.from('devices').update({ history: `• Riwayat direset pada ${nowStr}` }).eq('id', id);
        logActivity(`Mereset riwayat status device ID: ${id}`);
        renderDevices();
    }
}

async function deleteDevice(id) {
    if(confirm("Apakah Anda yakin ingin menghapus data device ini dari cloud?")) {
        await supabaseClient.from('devices').delete().eq('id', id);
        logActivity(`Menghapus data device ID: ${id}`);
        renderDevices();
    }
}

// ==========================================
// 4. ACTIVITY LOGS RENDER
// ==========================================
async function renderActivityLogs() {
    const { data: logs, error } = await supabaseClient
        .from('activity_logs')
        .select('*')
        .order('id', { ascending: false });

    const tbody = document.getElementById('table-activity');
    if(!tbody) return;
    tbody.innerHTML = '';

    if (error || !logs || logs.length === 0) {
        tbody.innerHTML = `<tr><td colspan="3" class="text-center text-muted">Belum ada riwayat aktifitas tercatat.</td></tr>`;
        return;
    }

    logs.forEach(log => {
        tbody.innerHTML += `
            <tr>
                <td>${log.created_at || '-'}</td>
                <td><strong class="text-primary">${log.username || 'System'}</strong></td>
                <td>${log.activity || ''}</td>
            </tr>
        `;
    });
}

// ==========================================
// 5. CRUD USERS & RESET 2FA
// ==========================================
async function renderUsers() {
    const { data: users } = await supabaseClient.from('app_users').select('*');
    const tbody = document.getElementById('table-user');
    tbody.innerHTML = '';
    
    if(!users) return;
    users.forEach(u => {
        const roleBadge = u.role === 'Admin' ? `<span class="text-primary font-bold">Admin</span>` : `<span class="text-warning font-bold">Member</span>`;
        const status2FA = u.is_2fa_setup ? `<span class="text-success">Aktif</span>` : `<span class="text-danger">Belum Setup</span>`;
        
        tbody.innerHTML += `
            <tr>
                <td>${u.username}</td>
                <td>${roleBadge}</td>
                <td>${status2FA}</td>
                <td>••••••••</td>
                <td>
                    <button class="btn btn-warning" style="padding:5px 8px; font-size:11px;" onclick="editUser(${u.id})">Edit</button>
                    <button class="btn btn-info" style="padding:5px 8px; font-size:11px;" onclick="resetUser2FA(${u.id}, '${u.username}')" title="Reset Status 2FA User">Reset 2FA</button>
                    ${users.length > 1 ? `<button class="btn btn-danger" style="padding:5px 8px; font-size:11px;" onclick="deleteUser(${u.id}, '${u.username}')">Hapus</button>` : `<span class="badge" style="background:#333;color:#fff;">Default</span>`}
                </td>
            </tr>
        `;
    });
}

async function resetUser2FA(id, username) {
    if(confirm(`Apakah Anda yakin ingin mereset 2FA untuk user "${username}"?`)) {
        const { error } = await supabaseClient.from('app_users').update({ is_2fa_setup: false }).eq('id', id);
        if(!error) {
            logActivity(`Admin mereset 2FA untuk user: ${username}`);
            alert("Status 2FA berhasil direset!");
            renderUsers();
        } else {
            alert("Gagal reset 2FA: " + error.message);
        }
    }
}

async function saveUser() {
    const id = document.getElementById('usr-id').value;
    const user = document.getElementById('usr-name').value;
    const pass = document.getElementById('usr-pass').value;
    const role = document.getElementById('usr-role').value;

    if(!user || !pass) return alert("Username & Password harus diisi!");

    const data = { username: user, password: pass, role: role };

    if (id) {
        await supabaseClient.from('app_users').update(data).eq('id', id);
        logActivity(`Mengubah data user login: ${user}`);
    } else {
        await supabaseClient.from('app_users').insert([{ ...data, is_2fa_setup: false }]);
        logActivity(`Membuat akun user login baru: ${user}`);
    }

    closeModal('modal-user');
    renderUsers();
}

async function editUser(id) {
    const { data } = await supabaseClient.from('app_users').select('*').eq('id', id).single();
    if(data) {
        document.getElementById('title-user').innerText = 'Edit Akses User Cloud';
        document.getElementById('usr-id').value = data.id;
        document.getElementById('usr-name').value = data.username;
        document.getElementById('usr-pass').value = data.password;
        document.getElementById('usr-role').value = data.role;
        document.getElementById('modal-user').classList.remove('hidden');
    }
}

async function deleteUser(id, username) {
    if(confirm(`Hapus hak akses user "${username}" dari cloud?`)) {
        await supabaseClient.from('app_users').delete().eq('id', id);
        logActivity(`Menghapus akun user: ${username}`);
        renderUsers();
    }
}

// ==========================================
// 6. MODALS & EXCEL EXPORT/IMPORT
// ==========================================
function openModal(modalId) {
    document.getElementById(modalId).classList.remove('hidden');
    if(modalId === 'modal-device') {
        document.getElementById('title-device').innerText = 'Tambah Data Device Baru';
        document.getElementById('dev-id').value = '';
        document.getElementById('dev-nama').value = '';
        document.getElementById('dev-sn').value = '';
        document.getElementById('dev-email').value = '';
        document.getElementById('dev-team').value = 'Afin';
        document.getElementById('dev-alamat').value = '';
        document.getElementById('dev-tgl').value = new Date().toISOString().split('T')[0];
        document.getElementById('dev-status').value = 'Belum di setup';
    } else if(modalId === 'modal-user') {
        document.getElementById('title-user').innerText = 'Tambah Akun Akses Baru';
        document.getElementById('usr-id').value = '';
        document.getElementById('usr-name').value = '';
        document.getElementById('usr-pass').value = '';
        document.getElementById('usr-role').value = 'Member';
    }
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.add('hidden');
}

async function exportExcel() {
    const { data: devices } = await supabaseClient.from('devices').select('*');
    if (!devices || devices.length === 0) return alert("Belum ada data untuk di-export.");
    const worksheet = XLSX.utils.json_to_sheet(devices);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "DataDeploy");
    XLSX.writeFile(workbook, "AutoPilot_Cloud_Data.xlsx");
    logActivity("Mengekspor data device ke file Excel");
}

async function importExcel(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async function(e) {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, {type: 'array'});
        const sheetName = workbook.SheetNames[0];
        const importedData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
        
        if (importedData.length > 0) {
            const nowStr = new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
            const mappedData = importedData.map(item => ({
                nama: item.nama || '',
                sn: item.sn || '',
                email: item.email || '',
                team: item.team || 'Afin',
                alamat: item.alamat || '',
                tanggal: item.tanggal || new Date().toISOString().split('T')[0],
                status: item.status || 'Belum di setup',
                history: `• Diimpor dari Excel pada ${nowStr}`
            }));
            
            await supabaseClient.from('devices').insert(mappedData);
            logActivity(`Mengimpor ${mappedData.length} data device dari file Excel`);
            renderDevices();
            alert("Berhasil mengimpor data ke Supabase Cloud!");
        }
    };
    reader.readAsArrayBuffer(file);
    event.target.value = "";
}