// ==========================================
// PENGATURAN DATABASE (HYBRID: SUPABASE / LOCALSTORAGE)
// ==========================================
// JIKA SUPABASE_URL MASIH DEFAULT/KOSONG, SISTEM OTOMATIS MENGGUNAKAN LOCALSTORAGE
const SUPABASE_URL = 'https://xnfdvmxbklqelwvxzygp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhuZmR2bXhia2xxZWx3dnh6eWdwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk2NDgwMzQsImV4cCI6MjEwNTIyNDAzNH0.c6rY_GA0vBjGMnUQc9xDPKSYC1sB1fNiYZU1kVbKt2Q';

let supabaseClient = null;
let useLocalStorage = true; // Fallback jika supabase belum disetup

if (!SUPABASE_URL.includes('ISI_DENGAN')) {
    try {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        useLocalStorage = false;
    } catch (e) { console.error(e); }
}

// Inisialisasi Data Default LocalStorage (Hanya dipakai jika Supabase belum diset)
let localDevices = JSON.parse(localStorage.getItem('ap_devices')) || [];
let localUsers = JSON.parse(localStorage.getItem('ap_users')) || [
    { id: 1, username: 'admin', password: 'admin123', role: 'Admin', is_2fa_setup: false },
    { id: 2, username: 'member', password: 'member123', role: 'Member', is_2fa_setup: false }
];

let currentUser = null;

// ==========================================
// EVENT LISTENER AWAL
// ==========================================
window.addEventListener('DOMContentLoaded', () => {
    // 1. Cek Sesi Login (Refresh browser tetap di dashboard)
    const savedSession = localStorage.getItem('autopilot_session');
    if (savedSession) {
        currentUser = JSON.parse(savedSession);
        document.getElementById('auth-section').classList.add('hidden');
        document.getElementById('app-section').classList.remove('hidden');
        initApp();
    }

    // 2. Aktifkan Fungsi Tombol ENTER di Keyboard
    setupEnterListeners();
});

function setupEnterListeners() {
    const bindEnter = (id, action) => {
        const el = document.getElementById(id);
        if(el) el.addEventListener('keypress', e => { if (e.key === 'Enter') action(); });
    }
    bindEnter('login-user', () => document.getElementById('login-pass').focus());
    bindEnter('login-pass', handleLogin);
    bindEnter('mfa-code', handle2FA);
    bindEnter('reset-user', () => document.getElementById('reset-pass').focus());
    bindEnter('reset-pass', handleReset);
    bindEnter('search-input', searchDevice);
}


// ==========================================
// 1. SISTEM LOGIN & AUTENTIKASI
// ==========================================
function toggleAuth(view) {
    document.getElementById('login-card').classList.add('hidden');
    document.getElementById('mfa-card').classList.add('hidden');
    document.getElementById('reset-card').classList.add('hidden');
    document.getElementById(`${view}-card`).classList.remove('hidden');
}

// Fitur Auto-fill untuk Demo (Klik Pojok Kanan Atas)
function fillDemoAccount() {
    document.getElementById('login-user').value = 'admin';
    document.getElementById('login-pass').value = 'admin123';
    document.getElementById('login-pass').focus();
}

async function handleLogin() {
    const user = document.getElementById('login-user').value.trim();
    const pass = document.getElementById('login-pass').value.trim();
    
    if (!user || !pass) return alert("Username dan Password wajib diisi!");

    let accountFound = null;

    if (!useLocalStorage) {
        // Via Supabase
        const { data } = await supabaseClient.from('app_users').select('*').eq('username', user).eq('password', pass);
        if (data && data.length > 0) accountFound = data[0];
    } else {
        // Via LocalStorage (Fallback)
        accountFound = localUsers.find(u => u.username === user && u.password === pass);
    }

    if (!accountFound) return alert("Login Gagal: Username atau Password salah!");

    currentUser = accountFound;
    toggleAuth('mfa');
    prepareAuthenticator(currentUser);
    setTimeout(() => document.getElementById('mfa-code').focus(), 100);
}

function prepareAuthenticator(account) {
    const qrDiv = document.getElementById('qrcode');
    qrDiv.innerHTML = ''; 

    if (!account.is_2fa_setup) {
        document.getElementById('qr-container').classList.remove('hidden');
        document.getElementById('mfa-instruction').innerText = "SETUP PERTAMA: Buka Authenticator dan Scan Barcode ini.";
        const otpUrl = `otpauth://totp/AutoPilotApp:${account.username}?secret=JBSWY3DPEHPK3PXP&issuer=AutoPilotApp`;
        new QRCode(qrDiv, { text: otpUrl, width: 140, height: 140, colorDark: "#000", colorLight: "#fff" });
    } else {
        document.getElementById('qr-container').classList.add('hidden');
        document.getElementById('mfa-instruction').innerText = "Masukkan 6 digit kode dari aplikasi Authenticator Anda.";
    }
}

async function handle2FA() {
    const code = document.getElementById('mfa-code').value.trim();
    
    // Verifikasi 6 Angka Apapun (Simulasi)
    if (code.length === 6 && !isNaN(code)) {
        
        // Simpan status 2FA bahwa sudah pernah disetup
        if (!currentUser.is_2fa_setup) {
            currentUser.is_2fa_setup = true;
            if (!useLocalStorage) {
                await supabaseClient.from('app_users').update({ is_2fa_setup: true }).eq('id', currentUser.id);
            } else {
                const idx = localUsers.findIndex(u => u.id === currentUser.id);
                localUsers[idx].is_2fa_setup = true;
                localStorage.setItem('ap_users', JSON.stringify(localUsers));
            }
        }

        // Simpan Sesi di Browser agar saat refresh tidak logout
        localStorage.setItem('autopilot_session', JSON.stringify(currentUser));

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

    let isSuccess = false;

    if (!useLocalStorage) {
        const { data } = await supabaseClient.from('app_users').update({ password: newPass }).eq('username', user).select();
        isSuccess = (data && data.length > 0);
    } else {
        const idx = localUsers.findIndex(u => u.username === user);
        if(idx > -1) {
            localUsers[idx].password = newPass;
            localStorage.setItem('ap_users', JSON.stringify(localUsers));
            isSuccess = true;
        }
    }

    if (isSuccess) {
        alert("Reset Password Berhasil! Silakan login kembali dengan password baru.");
        toggleAuth('login');
    } else {
        alert("Gagal: Username tidak ditemukan di sistem.");
    }
}

function logout() {
    currentUser = null;
    localStorage.removeItem('autopilot_session'); // Hapus sesi
    document.getElementById('app-section').classList.add('hidden');
    document.getElementById('auth-section').classList.remove('hidden');
    document.querySelectorAll('.input-form').forEach(el => el.value = ''); // Bersihkan input
    toggleAuth('login');
}


// ==========================================
// 2. DASHBOARD & STATISTIK KLIK FILTER
// ==========================================
async function initApp() {
    if(!currentUser) return;
    document.getElementById('login-role-badge').innerText = `[ Role: ${currentUser.role} ]`;

    // Pengaturan Hak Akses
    if(currentUser.role === 'Admin') {
        document.getElementById('tab-btn-admin').style.display = 'inline-block';
        renderUsers();
    } else {
        document.getElementById('tab-btn-admin').style.display = 'none';
        switchTab('device'); // Paksa ke tab device
    }

    await renderDevices();
}

function switchTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    document.getElementById(`tab-${tabName}`).classList.add('active');
    event.currentTarget.classList.add('active');
}

// Fungsi Klik Kartu Statistik (Mengubah Dropdown Filter & Render)
function setStatFilter(statusValue) {
    document.getElementById('filter-status-select').value = statusValue;
    renderDevices();
}

async function updateDashboardStats(dataList) {
    document.getElementById('stat-total').innerText = dataList.length;
    document.getElementById('stat-belum').innerText = dataList.filter(d => d.status === 'Belum di setup').length;
    document.getElementById('stat-progress').innerText = dataList.filter(d => d.status === 'On progress').length;
    document.getElementById('stat-setup').innerText = dataList.filter(d => d.status === 'Done setup').length;
    document.getElementById('stat-deploy').innerText = dataList.filter(d => d.status === 'Done deploy user').length;
}


// ==========================================
// 3. FORMAT TANGGAL & CRUD DEVICES
// ==========================================

// Fungsi mengubah YYYY-MM-DD menjadi format: Senin, 21 September 2026
function formatTanggalIndo(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    if(isNaN(d)) return dateStr;
    const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    return `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function getStatusBadge(status) {
    if(status === 'Belum di setup') return `<span class="badge badge-belum">${status}</span>`;
    if(status === 'On progress') return `<span class="badge badge-progress">${status}</span>`;
    if(status === 'Done setup') return `<span class="badge badge-setup">${status}</span>`;
    if(status === 'Done deploy user') return `<span class="badge badge-deploy">${status}</span>`;
    return status;
}

async function renderDevices() {
    let list = [];
    if (!useLocalStorage) {
        const { data } = await supabaseClient.from('devices').select('*');
        list = data || [];
    } else {
        list = localDevices;
    }

    // 1. Update Kartu Dashboard sebelum filter diterapkan agar angkanya tetap real
    updateDashboardStats(list);

    // 2. Filter Status Deploy (Dari Dropdown)
    const statFilter = document.getElementById('filter-status-select').value;
    if (statFilter !== 'All') {
        list = list.filter(d => d.status === statFilter);
    }

    // 3. Filter Pencarian Multi (Nama, SN, Email)
    const searchVal = document.getElementById('search-input').value.toLowerCase().trim();
    if (searchVal) {
        list = list.filter(d => 
            (d.nama && d.nama.toLowerCase().includes(searchVal)) || 
            (d.sn && d.sn.toLowerCase().includes(searchVal)) ||
            (d.email && d.email.toLowerCase().includes(searchVal))
        );
    }

    // 4. Sortir & Urutan
    const sortVal = document.getElementById('sort-date-select').value;
    list.sort((a, b) => {
        // if newest_update, sort by ID descending (simulating latest added/updated if we don't have updated_at column)
        if (sortVal === 'newest_update') return b.id - a.id; 
        
        const dateA = a.tanggal || '';
        const dateB = b.tanggal || '';
        
        if (sortVal === 'oldest_deploy') return dateA.localeCompare(dateB);
        if (sortVal === 'newest_deploy') return dateB.localeCompare(dateA);
        return 0;
    });

    // Render ke HTML
    const tbody = document.getElementById('table-device');
    tbody.innerHTML = '';

    list.forEach(d => {
        tbody.innerHTML += `
            <tr>
                <td>${d.nama || ''}</td>
                <td>${d.sn || ''}</td>
                <td>${d.email || ''}</td>
                <td>${d.alamat || ''}</td>
                <td><strong>${formatTanggalIndo(d.tanggal)}</strong></td>
                <td>${getStatusBadge(d.status)}</td>
                <td><div class="history-box">${d.history || '<em>Belum ada update</em>'}</div></td>
                <td>
                    <button class="btn btn-warning" style="padding:5px 10px; font-size:11px;" onclick="editDevice(${d.id})">Edit</button>
                    <button class="btn btn-danger" style="padding:5px 10px; font-size:11px; margin-top:5px;" onclick="deleteDevice(${d.id})">Hapus</button>
                </td>
            </tr>
        `;
    });
}

function searchDevice() {
    renderDevices();
}

async function saveDevice() {
    const id = document.getElementById('dev-id').value;
    const nama = document.getElementById('dev-nama').value;
    const sn = document.getElementById('dev-sn').value;
    const email = document.getElementById('dev-email').value;
    const alamat = document.getElementById('dev-alamat').value;
    const tanggal = document.getElementById('dev-tgl').value;
    const status = document.getElementById('dev-status').value;

    const nowTime = new Date().toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' });

    let historyLog = '';

    if (id) {
        // MENGEDIT DATA
        let oldData = null;
        if (!useLocalStorage) {
            const { data } = await supabaseClient.from('devices').select('*').eq('id', id).single();
            oldData = data;
        } else {
            oldData = localDevices.find(d => d.id == id);
        }

        historyLog = oldData.history || '';
        
        // Logika mencatat histori jika ada perubahan Tgl atau Status
        let changes = [];
        if (oldData.status !== status) changes.push(`Status: <span>${status}</span>`);
        if (oldData.tanggal !== tanggal) changes.push(`Tgl Deploy: <span>${formatTanggalIndo(tanggal)}</span>`);
        
        if (changes.length > 0) {
            historyLog = `<div class="time">[${nowTime}]</div> Diupdate: ${changes.join(', ')}<hr style="border:0; border-top:1px solid #333; margin:4px 0;">` + historyLog;
        }

        const updatedRow = { nama, sn, email, alamat, tanggal, status, history: historyLog };

        if (!useLocalStorage) {
            await supabaseClient.from('devices').update(updatedRow).eq('id', id);
        } else {
            const idx = localDevices.findIndex(d => d.id == id);
            localDevices[idx] = { ...localDevices[idx], ...updatedRow };
            localStorage.setItem('ap_devices', JSON.stringify(localDevices));
        }

    } else {
        // MENAMBAH DATA BARU
        historyLog = `<div class="time">[${nowTime}]</div> <span>Dibuat</span> oleh ${currentUser.username}`;
        const newRow = { id: Date.now(), nama, sn, email, alamat, tanggal, status, history: historyLog };

        if (!useLocalStorage) {
            await supabaseClient.from('devices').insert([newRow]);
        } else {
            localDevices.push(newRow);
            localStorage.setItem('ap_devices', JSON.stringify(localDevices));
        }
    }
    
    closeModal('modal-device');
    renderDevices();
}

async function editDevice(id) {
    let data = null;
    if (!useLocalStorage) {
        const res = await supabaseClient.from('devices').select('*').eq('id', id).single();
        data = res.data;
    } else {
        data = localDevices.find(d => d.id == id);
    }

    if(data) {
        document.getElementById('title-device').innerText = 'Edit Status & Data Deploy';
        document.getElementById('dev-id').value = data.id;
        document.getElementById('dev-nama').value = data.nama;
        document.getElementById('dev-sn').value = data.sn;
        document.getElementById('dev-email').value = data.email;
        document.getElementById('dev-alamat').value = data.alamat;
        document.getElementById('dev-tgl').value = data.tanggal; // Value input type date butuh format YYYY-MM-DD
        document.getElementById('dev-status').value = data.status;
        document.getElementById('modal-device').classList.remove('hidden');
    }
}

async function deleteDevice(id) {
    if(confirm("Apakah Anda yakin ingin menghapus data device ini?")) {
        if (!useLocalStorage) {
            await supabaseClient.from('devices').delete().eq('id', id);
        } else {
            localDevices = localDevices.filter(d => d.id != id);
            localStorage.setItem('ap_devices', JSON.stringify(localDevices));
        }
        renderDevices();
    }
}

// ==========================================
// 4. MODALS & EXCEL EXPORT/IMPORT
// ==========================================
function openModal(modalId) {
    document.getElementById(modalId).classList.remove('hidden');
    if(modalId === 'modal-device') {
        document.getElementById('title-device').innerText = 'Tambah Data Device Baru';
        document.getElementById('dev-id').value = '';
        document.getElementById('dev-nama').value = '';
        document.getElementById('dev-sn').value = '';
        document.getElementById('dev-email').value = '';
        document.getElementById('dev-alamat').value = '';
        document.getElementById('dev-tgl').value = ''; 
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
    let list = useLocalStorage ? localDevices : (await supabaseClient.from('devices').select('*')).data;
    if (!list || list.length === 0) return alert("Belum ada data untuk di-export.");
    
    const worksheet = XLSX.utils.json_to_sheet(list);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "DataDeploy");
    XLSX.writeFile(workbook, "AutoPilot_Data_Deploy.xlsx");
}

async function importExcel(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async function(e) {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, {type: 'array'});
        const importedData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
        
        if (importedData.length > 0) {
            const nowTime = new Date().toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' });
            
            const mappedData = importedData.map(item => ({
                id: Date.now() + Math.floor(Math.random() * 10000),
                nama: item.nama || '',
                sn: item.sn || '',
                email: item.email || '',
                alamat: item.alamat || '',
                tanggal: item.tanggal || new Date().toISOString().split('T')[0],
                status: item.status || 'Belum di setup',
                history: `<div class="time">[${nowTime}]</div> Diimpor dari Excel`
            }));
            
            if (!useLocalStorage) {
                await supabaseClient.from('devices').insert(mappedData);
            } else {
                localDevices = [...localDevices, ...mappedData];
                localStorage.setItem('ap_devices', JSON.stringify(localDevices));
            }

            renderDevices();
            alert("Data Excel berhasil di-import!");
        }
    };
    reader.readAsArrayBuffer(file);
    event.target.value = "";
}

// ==========================================
// 5. CRUD USERS / AKUN (HANYA ADMIN)
// ==========================================
async function renderUsers() {
    let list = useLocalStorage ? localUsers : (await supabaseClient.from('app_users').select('*')).data;
    const tbody = document.getElementById('table-user');
    tbody.innerHTML = '';
    
    if(!list) return;
    list.forEach(u => {
        const roleBadge = u.role === 'Admin' ? `<span class="text-primary font-bold">Admin</span>` : `<span class="text-warning font-bold">Member</span>`;
        const status2FA = u.is_2fa_setup ? `<span class="text-success">Aktif</span>` : `<span class="text-danger">Belum Setup</span>`;
        
        tbody.innerHTML += `
            <tr>
                <td>${u.username}</td>
                <td>${roleBadge}</td>
                <td>${status2FA}</td>
                <td>••••••••</td>
                <td>
                    <button class="btn btn-warning" style="padding:5px 10px; font-size:11px;" onclick="editUser(${u.id})">Edit</button>
                    ${list.length > 1 ? `<button class="btn btn-danger" style="padding:5px 10px; font-size:11px;" onclick="deleteUser(${u.id})">Hapus</button>` : `<span class="badge" style="background:#333;color:#fff;">Default</span>`}
                </td>
            </tr>
        `;
    });
}

async function saveUser() {
    const id = document.getElementById('usr-id').value;
    const user = document.getElementById('usr-name').value;
    const pass = document.getElementById('usr-pass').value;
    const role = document.getElementById('usr-role').value;

    if(!user || !pass) return alert("Username & Password harus diisi!");

    const dataObj = { username: user, password: pass, role: role };

    if (id) {
        if (!useLocalStorage) {
            await supabaseClient.from('app_users').update(dataObj).eq('id', id);
        } else {
            const idx = localUsers.findIndex(u => u.id == id);
            localUsers[idx] = { ...localUsers[idx], ...dataObj };
        }
    } else {
        if (!useLocalStorage) {
            await supabaseClient.from('app_users').insert([{ ...dataObj, is_2fa_setup: false }]);
        } else {
            localUsers.push({ id: Date.now(), ...dataObj, is_2fa_setup: false });
        }
    }

    if (useLocalStorage) localStorage.setItem('ap_users', JSON.stringify(localUsers));
    
    closeModal('modal-user');
    renderUsers();
}

async function editUser(id) {
    let data = null;
    if (!useLocalStorage) {
        const res = await supabaseClient.from('app_users').select('*').eq('id', id).single();
        data = res.data;
    } else {
        data = localUsers.find(u => u.id == id);
    }

    if(data) {
        document.getElementById('title-user').innerText = 'Edit Akses User';
        document.getElementById('usr-id').value = data.id;
        document.getElementById('usr-name').value = data.username;
        document.getElementById('usr-pass').value = data.password;
        document.getElementById('usr-role').value = data.role;
        document.getElementById('modal-user').classList.remove('hidden');
    }
}

async function deleteUser(id) {
    if(confirm("Hapus hak akses user ini?")) {
        if (!useLocalStorage) {
            await supabaseClient.from('app_users').delete().eq('id', id);
        } else {
            localUsers = localUsers.filter(u => u.id != id);
            localStorage.setItem('ap_users', JSON.stringify(localUsers));
        }
        renderUsers();
    }
}