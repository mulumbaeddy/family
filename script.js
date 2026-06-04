// ============================================
// SUPABASE CONFIGURATION
// ============================================
const SUPABASE_URL = 'https://vbrzbpzecmldkgiejhkj.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZicnpicHplY21sZGtnaWVqaGtqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1MzQ1MzgsImV4cCI6MjA5NjExMDUzOH0.V6-RKPp52-HAx9VcqHavVAsnCdYOtONjy_HNcr9lonE';

// ============================================
// APP STATE
// ============================================
let _supabase = null;
let _currentUser = null;
let _currentRole = null;
let _selectedRole = null;
let _currentPage = 'dashboard';
let _shareMessage = '';
let _activities = [];
let _familyMembers = [];
let _realtimeSubscription = null;

// ============================================
// TOAST NOTIFICATION SYSTEM
// ============================================
let toastQueue = [];
let isShowingToast = false;

function getToastIcon(type) {
    switch(type) {
        case 'success': return 'fa-check-circle';
        case 'warning': return 'fa-exclamation-triangle';
        case 'error': return 'fa-times-circle';
        default: return 'fa-info-circle';
    }
}

function closeToast(toast) {
    if (!toast || !toast.parentElement) return;
    if (toast._timeout) clearTimeout(toast._timeout);
    toast.style.animation = 'slideOutRight 0.3s ease';
    setTimeout(() => { if (toast.parentElement) toast.remove(); }, 300);
}

function showToast(title, message, type = 'info', duration = 5000) {
    const toastContainer = document.getElementById('toastContainer');
    if (!toastContainer) return;
    
    const toast = document.createElement('div');
    toast.className = `toast-notification ${type}`;
    toast.setAttribute('role', 'alert');
    toast.innerHTML = `
        <div class="toast-title"><i class="fas ${getToastIcon(type)}"></i> ${title}</div>
        <div class="toast-message">${message}</div>
        <div class="toast-close" onclick="closeToast(this.parentElement)">✕</div>
    `;
    toast.addEventListener('click', (e) => { if (e.target !== toast.querySelector('.toast-close')) closeToast(toast); });
    toastContainer.appendChild(toast);
    const timeout = setTimeout(() => closeToast(toast), duration);
    toast._timeout = timeout;
    if (window.navigator && window.navigator.vibrate) window.navigator.vibrate(100);
    return toast;
}

function queueToast(title, message, type = 'info', duration = 5000) {
    toastQueue.push({ title, message, type, duration });
    processToastQueue();
}

function processToastQueue() {
    if (isShowingToast || toastQueue.length === 0) return;
    isShowingToast = true;
    const { title, message, type, duration } = toastQueue.shift();
    const toastElement = showToast(title, message, type, duration);
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.removedNodes.length > 0) {
                isShowingToast = false;
                observer.disconnect();
                processToastQueue();
            }
        });
    });
    observer.observe(document.body, { childList: true, subtree: true });
}

// ============================================
// INITIALIZATION
// ============================================
(async function init() {
    try {
        document.getElementById('loadingStatus').innerText = 'Connecting to Supabase...';
        _supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        document.getElementById('loadingStatus').innerText = 'Loading data...';
        await loadData();
        document.getElementById('loadingScreen').style.display = 'none';
        document.getElementById('loginScreen').style.display = 'block';
        registerServiceWorker();
    } catch (error) {
        document.getElementById('loadingStatus').innerText = 'Error: ' + error.message;
        console.error('Init error:', error);
    }
})();

async function loadData() {
    const { data: members } = await _supabase.from('family_members').select('*');
    if (members) _familyMembers = members;
    
    const { data: acts } = await _supabase.from('activities').select('*');
    if (acts) {
        _activities = [];
        for (const act of acts) {
            const { data: memberActs } = await _supabase
                .from('member_activities')
                .select('*, family_members(name, phone, email, role)')
                .eq('activity_id', act.id);
            _activities.push({
                id: act.id,
                name: act.name,
                description: act.description,
                totalBudget: act.total_budget,
                expectedCompletionDate: act.expected_completion_date,
                status: act.status,
                memberPayments: memberActs || []
            });
        }
    }
    
    const select = document.getElementById('userSelect');
    if (select && _familyMembers.length) {
        select.innerHTML = '<option value="">Select your name...</option>' + 
            _familyMembers.map(m => `<option value="${m.id}">${m.name} (${m.role === 'parent' ? 'Parent' : 'Child'})</option>`).join('');
    }
}

// ============================================
// DATA ACCESS FUNCTIONS
// ============================================
async function getFamilyMembers() { return _familyMembers; }
async function getActivities() { return _activities; }

async function getMemberActivities(memberId) {
    const memberActivities = [];
    for (const a of _activities) {
        const memberData = a.memberPayments?.find(mp => mp.member_id === memberId);
        if (memberData) {
            memberActivities.push({
                ...a,
                memberData: {
                    amountOwed: memberData.amount_owed,
                    amountPaid: memberData.amount_paid,
                    status: memberData.status
                }
            });
        }
    }
    return memberActivities;
}

async function getMemberPayments(memberId) {
    let payments = [];
    for (const a of _activities) {
        const { data: payData } = await _supabase
            .from('payments')
            .select('*')
            .eq('activity_id', a.id)
            .eq('member_id', memberId);
        if (payData) {
            payData.forEach(p => { payments.push({ ...p, activityName: a.name }); });
        }
    }
    return payments.sort((a, b) => new Date(b.payment_date) - new Date(a.payment_date));
}

async function getAllPayments() {
    let payments = [];
    for (const a of _activities) {
        const { data: payData } = await _supabase
            .from('payments')
            .select('*, family_members(name)')
            .eq('activity_id', a.id);
        if (payData) {
            payData.forEach(p => {
                payments.push({ ...p, activityName: a.name, memberName: p.family_members?.name || 'Unknown' });
            });
        }
    }
    return payments.sort((a, b) => new Date(b.payment_date) - new Date(a.payment_date));
}

async function getStatistics() {
    const activeActivities = _activities.filter(a => a.status === 'active').length;
    const completedActivities = _activities.filter(a => a.status === 'completed').length;
    let totalCollected = 0, totalOwed = 0;
    _activities.forEach(a => {
        a.memberPayments?.forEach(mp => {
            totalCollected += mp.amount_paid || 0;
            totalOwed += mp.amount_owed || 0;
        });
    });
    return { activeActivities, completedActivities, totalCollected, totalOwed };
}

async function getUserStatistics(userId) {
    let totalOwed = 0, totalPaid = 0;
    _activities.forEach(a => {
        const mp = a.memberPayments?.find(mp => mp.member_id === userId);
        if (mp) {
            totalOwed += mp.amount_owed || 0;
            totalPaid += mp.amount_paid || 0;
        }
    });
    return { totalOwed, totalPaid, balance: totalOwed - totalPaid };
}

// ============================================
// CRUD OPERATIONS
// ============================================
async function createActivity(name, desc, budget, dueDate) {
    if (_currentRole !== 'admin') { 
        Swal.fire('Access Denied', 'Only administrators can create activities', 'error'); 
        return false; 
    }
    
    const members = await getFamilyMembers();
    if (members.length === 0) {
        Swal.fire('Error', 'No family members found. Please add members first.', 'error');
        return false;
    }
    
    const { data: activity, error } = await _supabase
        .from('activities')
        .insert({ name, description: desc, total_budget: parseFloat(budget), expected_completion_date: dueDate, status: 'active' })
        .select();
    
    if (error) { Swal.fire('Error', error.message, 'error'); return false; }
    
    const activityId = activity[0].id;
    const amountPerPerson = parseFloat(budget) / members.length;
    
    for (const member of members) {
        await _supabase.from('member_activities').insert({
            activity_id: activityId, member_id: member.id, amount_owed: amountPerPerson, amount_paid: 0, status: 'unpaid'
        });
    }
    
    await loadData();
    queueToast('✅ Activity Created', `"${name}" assigned to ${members.length} members. Each owes UGX ${amountPerPerson.toLocaleString()}`, 'success', 6000);
    Swal.fire('Success!', `Activity "${name}" created successfully.`, 'success');
    return true;
}

async function updateActivity(id, name, desc, budget, dueDate, status) {
    if (_currentRole !== 'admin') { 
        Swal.fire('Access Denied', 'Only administrators can edit activities', 'error'); 
        return false; 
    }
    
    const oldActivity = _activities.find(a => a.id === id);
    const { error } = await _supabase
        .from('activities')
        .update({ name, description: desc, total_budget: parseFloat(budget), expected_completion_date: dueDate, status })
        .eq('id', id);
    
    if (error) { Swal.fire('Error', error.message, 'error'); return false; }
    
    if (status === 'completed' && oldActivity?.status !== 'completed') {
        queueToast('🎉 Activity Completed!', `"${name}" has been completed. Great teamwork!`, 'success', 6000);
    }
    
    const members = await getFamilyMembers();
    const newAmount = parseFloat(budget) / members.length;
    await _supabase.from('member_activities').update({ amount_owed: newAmount }).eq('activity_id', id);
    
    await loadData();
    await renderCurrentPage();
    Swal.fire('Updated!', 'Activity updated successfully', 'success');
    return true;
}

async function deleteActivity(id) {
    if (_currentRole !== 'admin') { Swal.fire('Access Denied', 'Only administrators can delete activities', 'error'); return; }
    const result = await Swal.fire({ title: 'Delete Activity?', text: "This will delete all payment records!", icon: 'warning', showCancelButton: true, confirmButtonColor: '#d33', confirmButtonText: 'Delete' });
    if (result.isConfirmed) {
        await _supabase.from('payments').delete().eq('activity_id', id);
        await _supabase.from('member_activities').delete().eq('activity_id', id);
        await _supabase.from('activities').delete().eq('id', id);
        await loadData();
        await renderCurrentPage();
        Swal.fire('Deleted!', 'Activity has been deleted.', 'success');
    }
}

async function addMember(name, role, phone, email) {
    if (_currentRole !== 'admin') { Swal.fire('Access Denied', 'Only administrators can add members', 'error'); return false; }
    const { data: member, error } = await _supabase.from('family_members').insert({ name, role, phone, email }).select();
    if (error) { Swal.fire('Error', error.message, 'error'); return false; }
    
    const acts = await getActivities();
    for (const activity of acts) {
        if (activity.status === 'active') {
            const members = await getFamilyMembers();
            const newAmount = activity.totalBudget / (members.length + 1);
            await _supabase.from('member_activities').update({ amount_owed: newAmount }).eq('activity_id', activity.id);
            await _supabase.from('member_activities').insert({ activity_id: activity.id, member_id: member[0].id, amount_owed: newAmount, amount_paid: 0, status: 'unpaid' });
        }
    }
    await loadData();
    Swal.fire('Success!', `${name} added to family.`, 'success');
    return true;
}

async function updateMember(id, name, role, phone, email) {
    if (_currentRole !== 'admin') { Swal.fire('Access Denied', 'Only administrators can edit members', 'error'); return false; }
    const { error } = await _supabase.from('family_members').update({ name, role, phone, email }).eq('id', id);
    if (error) { Swal.fire('Error', error.message, 'error'); return false; }
    await loadData();
    Swal.fire('Success!', 'Member updated successfully', 'success');
    return true;
}

async function deleteMember(id) {
    if (_currentRole !== 'admin') { Swal.fire('Access Denied', 'Only administrators can delete members', 'error'); return; }
    const { data: payments } = await _supabase.from('payments').select('*').eq('member_id', id);
    if (payments && payments.length > 0) { Swal.fire('Error!', 'Cannot delete member with payment records', 'error'); return; }
    const result = await Swal.fire({ title: 'Remove Member?', text: "Remove this family member?", icon: 'warning', showCancelButton: true, confirmButtonColor: '#d33', confirmButtonText: 'Remove' });
    if (result.isConfirmed) {
        await _supabase.from('member_activities').delete().eq('member_id', id);
        await _supabase.from('family_members').delete().eq('id', id);
        await loadData();
        await renderCurrentPage();
        Swal.fire('Removed!', 'Member has been removed.', 'success');
    }
}

async function recordPayment(activityId, memberId, amount, date, notes) {
    if (_currentRole !== 'admin') { Swal.fire('Access Denied', 'Only administrators can record payments', 'error'); return false; }
    
    const member = _familyMembers.find(m => m.id === memberId);
    const activity = _activities.find(a => a.id === activityId);
    
    await _supabase.from('payments').insert({ activity_id: activityId, member_id: memberId, amount: parseFloat(amount), payment_date: date, notes });
    
    const { data: memberActivity } = await _supabase.from('member_activities').select('*').eq('activity_id', activityId).eq('member_id', memberId).single();
    const newPaid = (memberActivity?.amount_paid || 0) + parseFloat(amount);
    let status = 'unpaid';
    if (newPaid >= memberActivity.amount_owed) status = 'paid';
    else if (newPaid > 0) status = 'partial';
    
    await _supabase.from('member_activities').update({ amount_paid: newPaid, status }).eq('activity_id', activityId).eq('member_id', memberId);
    
    const { data: allMemberActivities } = await _supabase.from('member_activities').select('status').eq('activity_id', activityId);
    const allPaid = allMemberActivities?.every(ma => ma.status === 'paid');
    if (allPaid) {
        await _supabase.from('activities').update({ status: 'completed' }).eq('id', activityId);
        queueToast('🎉 Activity Completed!', `"${activity?.name}" is now fully paid!`, 'success', 6000);
    }
    
    queueToast('💰 Payment Recorded', `${member?.name} paid UGX ${parseFloat(amount).toLocaleString()} for "${activity?.name}"`, 'success', 4000);
    await loadData();
    Swal.fire('Success!', 'Payment recorded successfully', 'success');
    return true;
}

// ============================================
// COMMUNICATION FUNCTIONS
// ============================================
function sendSMS(phone, message) { if (phone) window.location.href = `sms:${phone}?body=${encodeURIComponent(message)}`; }
function sendWhatsApp(phone, message) { 
    if (phone) { 
        let cleanPhone = phone.replace(/\D/g, ''); 
        if (!cleanPhone.startsWith('256')) cleanPhone = '256' + cleanPhone; 
        window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`, '_blank'); 
    } 
}
function makeCall(phone) { if (phone) window.location.href = `tel:${phone}`; }

async function generateShareableReport() {
    if (_currentRole !== 'admin') { Swal.fire('Access Denied', 'Only administrators can share reports', 'error'); return; }
    
    const members = await getFamilyMembers();
    const stats = await getStatistics();
    let message = `📊 *OBUNANGWE BULAIIRE - COMPLETE REPORT* 📊\n\n`;
    message += `📅 ${new Date().toLocaleString()}\n`;
    message += `👥 Total Members: ${members.length}\n`;
    message += `💰 Total Collected: UGX ${stats.totalCollected.toLocaleString()}\n`;
    message += `📈 Total Pending: UGX ${(stats.totalOwed - stats.totalCollected).toLocaleString()}\n`;
    message += `✅ Completion Rate: ${stats.totalOwed > 0 ? ((stats.totalCollected / stats.totalOwed * 100)).toFixed(1) : 0}%\n\n`;
    message += `━═ *ACTIVITIES* ═━\n\n`;
    
    for (const a of _activities) {
        const collected = a.memberPayments?.reduce((sum, mp) => sum + (mp.amount_paid || 0), 0) || 0;
        const progress = (collected / a.totalBudget * 100).toFixed(1);
        const paidCount = a.memberPayments?.filter(mp => mp.status === 'paid').length || 0;
        const totalMembers = a.memberPayments?.length || 0;
        message += `📌 *${a.name}*\n   Budget: UGX ${a.totalBudget.toLocaleString()}\n   Collected: UGX ${collected.toLocaleString()} (${progress}%)\n   Members Paid: ${paidCount}/${totalMembers}\n   Status: ${a.status === 'completed' ? '✅ COMPLETED' : '🟡 ACTIVE'}\n\n`;
    }
    
    message += `━═ *MEMBER DETAILS* ═━\n\n`;
    for (const m of members) {
        const s = await getUserStatistics(m.id);
        message += `👤 *${m.name}* (${m.role === 'parent' ? 'Parent' : 'Child'})\n   💰 Owed: UGX ${s.totalOwed.toLocaleString()}\n   ✅ Paid: UGX ${s.totalPaid.toLocaleString()}\n   ⚖️ Balance: UGX ${s.balance.toLocaleString()}\n   Status: ${s.balance === 0 ? '✅ SETTLED' : s.balance > 0 ? '⚠️ PENDING' : '✅ OVERPAID'}\n\n`;
    }
    
    message += `━═ *SUMMARY* ═━\n🏆 Overall Progress: ${stats.totalOwed > 0 ? ((stats.totalCollected / stats.totalOwed * 100)).toFixed(1) : 100}%\n📱 *OBUNANGWE BULAIIRE*`;
    
    _shareMessage = message;
    document.getElementById('shareContent').innerHTML = `<pre style="white-space:pre-wrap; background:#f5f5f5; padding:15px; border-radius:10px; font-size:12px;">${message}</pre>`;
    document.getElementById('shareModal').style.display = 'flex';
}

async function sendWhatsAppToAll() {
    if (_shareMessage) {
        window.open(`https://wa.me/?text=${encodeURIComponent(_shareMessage)}`, '_blank');
        closeModal('shareModal');
        queueToast('📱 Share Report', 'WhatsApp opened. Select contacts to share with.', 'info', 3000);
    } else {
        Swal.fire('Error', 'No report to share', 'error');
    }
}

async function showActivityDetails(activityId) {
    const activity = _activities.find(a => a.id === activityId);
    if (!activity) return;
    
    let html = `<h3>${activity.name}</h3><p>${activity.description || 'No description'}</p>
        <p>💰 Budget: UGX ${(activity.totalBudget || 0).toLocaleString()}</p>
        <p>📅 Due: ${new Date(activity.expectedCompletionDate).toLocaleDateString()}</p>
        <p>Status: <span class="badge badge-${activity.status}">${activity.status}</span></p>
        <h4 style="margin-top:20px">Member Payments:</h4>
        <div style="overflow-x:auto"><table class="data-table"><thead><tr><th>Member</th><th>Role</th><th>Owed</th><th>Paid</th><th>Balance</th><th>Status</th></tr></thead><tbody>`;
    
    for (const mp of activity.memberPayments || []) {
        const balance = mp.amount_owed - mp.amount_paid;
        html += `<tr><td>${mp.family_members?.name || 'Unknown'}</td>
            <td>${mp.family_members?.role === 'parent' ? 'Parent' : 'Child'}</td>
            <td>UGX ${mp.amount_owed.toLocaleString()}</td>
            <td>UGX ${mp.amount_paid.toLocaleString()}</td>
            <td class="${balance === 0 ? 'paid-status' : 'unpaid-status'}">UGX ${balance.toLocaleString()}</td>
            <td>${mp.status === 'paid' ? '✅ Paid' : mp.status === 'partial' ? '⚠️ Partial' : '❌ Unpaid'}</td></tr>`;
    }
    html += `</tbody></table></div>`;
    document.getElementById('activityDetailsContent').innerHTML = html;
    document.getElementById('activityDetailsModal').style.display = 'flex';
}

// ============================================
// REALTIME NOTIFICATIONS
// ============================================
function setupRealtimeNotifications() {
    if (_realtimeSubscription) return;
    
    _realtimeSubscription = _supabase
        .channel('obunangwe-realtime')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activities' }, (payload) => {
            if (_currentRole === 'user') {
                queueToast('📢 New Activity!', `"${payload.new.name}" has been added. Check your share amount.`, 'info', 6000);
            }
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'activities' }, (payload) => {
            if (payload.new.status === 'completed' && payload.old.status !== 'completed') {
                queueToast('🎉 Activity Completed!', `"${payload.new.name}" is now complete. Thank you!`, 'success', 7000);
            }
        })
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'payments' }, async (payload) => {
            const { data: paymentData } = await _supabase.from('payments').select('*, family_members(name), activities(name)').eq('id', payload.new.id).single();
            if (paymentData && _currentRole === 'user' && _currentUser?.id === paymentData.member_id) {
                queueToast('✅ Payment Received!', `UGX ${paymentData.amount.toLocaleString()} recorded for "${paymentData.activities.name}"`, 'success', 5000);
            } else if (paymentData && _currentRole === 'admin') {
                queueToast('💰 Payment Recorded', `${paymentData.family_members?.name} paid UGX ${paymentData.amount.toLocaleString()}`, 'info', 5000);
            }
        })
        .subscribe();
}

// ============================================
// RENDER FUNCTIONS
// ============================================
async function renderAdminDashboard() {
    const stats = await getStatistics();
    const acts = await getActivities();
    document.getElementById('pageContent').innerHTML = `
        <div class="stats-grid">
            <div class="stat-card" onclick="switchPage('activities')"><div class="stat-number">${stats.activeActivities}</div><h3>Active Activities</h3></div>
            <div class="stat-card" onclick="switchPage('activities')"><div class="stat-number">${stats.completedActivities}</div><h3>Completed</h3></div>
            <div class="stat-card" onclick="switchPage('payments')"><div class="stat-number">UGX ${stats.totalCollected.toLocaleString()}</div><h3>Total Collected</h3></div>
            <div class="stat-card" onclick="switchPage('reports')"><div class="stat-number">UGX ${(stats.totalOwed - stats.totalCollected).toLocaleString()}</div><h3>Pending</h3></div>
        </div>
        <div class="card"><h2>Recent Activities <button class="btn-whatsapp" onclick="generateShareableReport()"><i class="fab fa-whatsapp"></i> Share Report</button></h2>
        <div style="overflow-x:auto"><table class="data-table"><thead><tr><th>Activity</th><th>Budget</th><th>Due Date</th><th>Members Paid</th><th>Status</th><th>Action</th></tr></thead><tbody>
        ${acts.slice(0,5).map(a => {
            const collected = a.memberPayments?.reduce((sum, mp) => sum + (mp.amount_paid || 0), 0) || 0;
            const progress = (collected / a.totalBudget * 100).toFixed(0);
            const paidCount = a.memberPayments?.filter(mp => mp.status === 'paid').length || 0;
            const totalMembers = a.memberPayments?.length || 0;
            return `<tr><td><strong>${a.name}</strong></td><td>UGX ${(a.totalBudget || 0).toLocaleString()}</td>
                <td>${new Date(a.expectedCompletionDate).toLocaleDateString()}</td>
                <td>${paidCount}/${totalMembers} (${progress}%)</td>
                <td><span class="badge badge-${a.status}">${a.status}</span></td>
                <td><button class="btn-edit" onclick="showActivityDetails(${a.id})">View</button></td></tr>`;
        }).join('') || '<tr><td colspan="6">No activities</td></tr>'}
        </tbody></table></div></div>`;
}

async function renderUserDashboard() {
    const userStats = await getUserStatistics(_currentUser.id);
    const userActivities = await getMemberActivities(_currentUser.id);
    const members = await getFamilyMembers();
    document.getElementById('pageContent').innerHTML = `
        <div class="stats-grid">
            <div class="stat-card"><div class="stat-number">UGX ${userStats.totalOwed.toLocaleString()}</div><h3>My Total Owed</h3></div>
            <div class="stat-card"><div class="stat-number">UGX ${userStats.totalPaid.toLocaleString()}</div><h3>My Total Paid</h3></div>
            <div class="stat-card"><div class="stat-number">UGX ${userStats.balance.toLocaleString()}</div><h3>My Balance</h3></div>
            <div class="stat-card"><div class="stat-number">${userActivities.length}</div><h3>My Activities</h3></div>
        </div>
        <div class="card"><h2>Family Members (${members.length})</h2>
        <div style="overflow-x:auto"><table class="data-table"><thead><tr><th>Avatar</th><th>Name</th><th>Role</th><th>Contact</th></tr></thead><tbody>
        ${members.map(m => `<tr><td><span style="font-size:24px">${m.role === 'parent' ? '👨‍👩' : '🧒'}</span></td>
            <td><strong>${m.name}</strong> ${m.id === _currentUser.id ? '(You)' : ''}</td>
            <td>${m.role === 'parent' ? 'Parent' : 'Child'}</td>
            <td>${m.phone ? `<button class="whatsapp-btn" onclick="sendWhatsApp('${m.phone}', 'Hello from OBUNANGWE BULAIIRE!')" style="padding:4px 8px"><i class="fab fa-whatsapp"></i></button>
            <button class="call-btn" onclick="makeCall('${m.phone}')" style="padding:4px 8px"><i class="fas fa-phone"></i></button>` : '-'}</td></tr>`).join('')}
        </tbody></table></div></div>
        <div class="card"><h2>My Recent Activities</h2>
        <div style="overflow-x:auto"><table class="data-table"><thead><tr><th>Activity</th><th>My Share</th><th>I've Paid</th><th>Balance</th><th>Due Date</th><th>Status</th></tr></thead><tbody>
        ${userActivities.slice(0,5).map(a => {
            const balance = a.memberData.amountOwed - a.memberData.amountPaid;
            return `<tr><td><strong>${a.name}</strong> ${a.status === 'completed' ? '✅' : ''}</td>
                <td>UGX ${a.memberData.amountOwed.toLocaleString()}</td>
                <td>UGX ${a.memberData.amountPaid.toLocaleString()}</td>
                <td class="${balance === 0 ? 'paid-status' : 'unpaid-status'}">UGX ${balance.toLocaleString()}</td>
                <td>${new Date(a.expectedCompletionDate).toLocaleDateString()}</td>
                <td class="${balance === 0 ? 'paid-status' : 'unpaid-status'}">${balance === 0 ? '✅ Paid' : '❌ Pending'}</td></tr>`;
        }).join('') || '<tr><td colspan="6">No activities assigned</td></tr>'}
        </tbody></table></div></div>`;
}

async function renderAdminActivities() {
    const acts = await getActivities();
    document.getElementById('pageContent').innerHTML = `<div class="card"><h2>All Activities <button class="btn-primary" onclick="openAddModal()"><i class="fas fa-plus"></i> New Activity</button></h2>
    <div class="activity-grid">${acts.map(a => {
        const collected = a.memberPayments?.reduce((sum, mp) => sum + (mp.amount_paid || 0), 0) || 0;
        const progress = a.totalBudget > 0 ? (collected / a.totalBudget * 100).toFixed(0) : 0;
        const paidCount = a.memberPayments?.filter(mp => mp.status === 'paid').length || 0;
        const totalMembers = a.memberPayments?.length || 0;
        return `<div class="activity-card"><h3>${a.name} ${a.status === 'completed' ? '✅' : ''}</h3>
            <p>${a.description || ''}</p><p>💰 Budget: UGX ${(a.totalBudget || 0).toLocaleString()}</p>
            <p>👥 Paid: ${paidCount}/${totalMembers} members</p>
            <p>📅 Due: ${new Date(a.expectedCompletionDate).toLocaleDateString()}</p>
            <div class="progress-bar-container"><div class="progress-bar" style="width:${progress}%">${progress}%</div></div>
            <span class="badge badge-${a.status}">${a.status}</span>
            <div style="margin-top:10px"><button class="btn-edit" onclick="openEditActivity(${a.id})">Edit</button>
            <button class="btn-danger" onclick="deleteActivity(${a.id})">Delete</button>
            <button class="btn-primary" onclick="showActivityDetails(${a.id})">Details</button></div></div>`;
    }).join('') || '<p>No activities created yet.</p>'}</div></div>`;
}

async function renderUserMyActivities() {
    const userActivities = await getMemberActivities(_currentUser.id);
    document.getElementById('pageContent').innerHTML = `<div class="card"><h2>My Activities</h2>
    ${userActivities.map(a => {
        const balance = a.memberData.amountOwed - a.memberData.amountPaid;
        const paidPercent = a.memberData.amountOwed > 0 ? (a.memberData.amountPaid / a.memberData.amountOwed * 100).toFixed(0) : 0;
        return `<div class="activity-card"><h3>${a.name} ${a.status === 'completed' ? '✅' : ''}</h3>
            ${a.status === 'completed' ? '<div class="completion-notification"><i class="fas fa-check-circle"></i> This activity has been completed! Thank you!</div>' : ''}
            <p>💰 Total Budget: UGX ${(a.totalBudget || 0).toLocaleString()}</p>
            <p>👤 My Share: UGX ${a.memberData.amountOwed.toLocaleString()}</p>
            <p>✅ I've Paid: UGX ${a.memberData.amountPaid.toLocaleString()}</p>
            <p>⏳ My Remaining: UGX ${balance.toLocaleString()}</p>
            <div class="progress-bar-container"><div class="progress-bar" style="width:${paidPercent}%">${paidPercent}% paid</div></div>
            ${balance === 0 ? '<span class="paid-status">✅ Fully paid! Great job! 🎉</span>' : '<span class="unpaid-status">❌ Payment pending</span>'}</div>`;
    }).join('') || '<p>No activities assigned to you yet.</p>'}</div>`;
}

async function renderAdminMembers() {
    const members = await getFamilyMembers();
    document.getElementById('pageContent').innerHTML = `
        <div class="card"><h2>Family Members <button class="btn-primary" onclick="openAddModal()"><i class="fas fa-plus"></i> Add Member</button></h2>
        <div style="overflow-x:auto"><table class="data-table"><thead><tr><th>Avatar</th><th>Name</th><th>Role</th><th>Phone</th><th>Email</th><th>Actions</th></tr></thead><tbody>
        ${members.map(m => `<tr>
            <td><span style="font-size:24px">${m.role === 'parent' ? '👨‍👩' : '🧒'}</span></td>
            <td><strong>${m.name}</strong></td><td>${m.role === 'parent' ? 'Parent' : 'Child'}</td>
            <td>${m.phone || '-'}</td><td>${m.email || '-'}</td>
            <td><button class="btn-edit" onclick="openEditMember(${m.id})">Edit</button>
            <button class="btn-danger" onclick="deleteMember(${m.id})">Remove</button>
            ${m.phone ? `<button class="btn-whatsapp" onclick="sendWhatsApp('${m.phone}', 'Hello from OBUNANGWE BULAIIRE!')" style="margin-left:5px;padding:5px 10px"><i class="fab fa-whatsapp"></i></button>` : ''}</td>
        </tr>`).join('')}
        </tbody>}</table></div></div>
        <div class="card"><h2>Member Payment Summary</h2>
        <div style="overflow-x:auto"><table class="data-table"><thead><tr><th>Member</th><th>Role</th><th>Total Owed</th><th>Total Paid</th><th>Balance</th><th>Status</th></tr></thead><tbody>
        ${await Promise.all(members.map(async m => {
            const stats = await getUserStatistics(m.id);
            return `<tr><td><strong>${m.name}</strong></td><td>${m.role === 'parent' ? 'Parent' : 'Child'}</td>
                <td>UGX ${stats.totalOwed.toLocaleString()}</td><td>UGX ${stats.totalPaid.toLocaleString()}</td>
                <td class="${stats.balance === 0 ? 'paid-status' : 'unpaid-status'}">UGX ${stats.balance.toLocaleString()}</td>
                <td>${stats.balance === 0 ? '✅ Settled' : stats.balance > 0 ? '⚠️ Pending' : '✅ Overpaid'}</td>
            </tr>`;
        }))}
        </tbody>}</table></div></div>`;
}

async function renderAdminPayments() {
    const payments = await getAllPayments();
    document.getElementById('pageContent').innerHTML = `<div class="card"><h2>All Payments <button class="btn-primary" onclick="openAddModal()"><i class="fas fa-plus"></i> Record Payment</button></h2>
    <div style="overflow-x:auto"><table class="data-table"><thead><tr><th>Date</th><th>Member</th><th>Activity</th><th>Amount</th><th>Notes</th></tr></thead><tbody>
    ${payments.map(p => `<tr>
        <td>${new Date(p.payment_date).toLocaleDateString()}</td>
        <td>${p.memberName}</td><td>${p.activityName}</td>
        <td>UGX ${p.amount.toLocaleString()}</td><td>${p.notes || '-'}</td>
    </tr>`).join('') || '<tr><td colspan="5">No payments recorded</td></tr>'}
    </tbody>}</table></div></div>`;
}

async function renderUserPayments() {
    const payments = await getMemberPayments(_currentUser.id);
    document.getElementById('pageContent').innerHTML = `<div class="card"><h2>My Payment History</h2>
    <div style="overflow-x:auto"><table class="data-table"><thead><tr><th>Date</th><th>Activity</th><th>Amount</th><th>Notes</th></tr></thead><tbody>
    ${payments.map(p => `<tr>
        <td>${new Date(p.payment_date).toLocaleDateString()}</td><td>${p.activityName}</td>
        <td>UGX ${p.amount.toLocaleString()}</td><td>${p.notes || '-'}</td>
    </tr>`).join('') || '<tr><td colspan="4">No payment history</td></tr>'}
    </tbody>}</table></div></div>`;
}

async function renderContacts() {
    const members = await getFamilyMembers();
    document.getElementById('pageContent').innerHTML = `<div class="card"><h2>Contacts</h2>
    ${members.map(m => `<div class="contact-card"><div><span style="font-size:32px">${m.role === 'parent' ? '👨‍👩' : '🧒'}</span><br><strong>${m.name}</strong><br>${m.role}<br>📞 ${m.phone || 'No phone'}</div>
    <div>${m.phone ? `<button class="whatsapp-btn" onclick="sendWhatsApp('${m.phone}', 'Hello from OBUNANGWE BULAIIRE!')">WhatsApp</button>
    <button class="call-btn" onclick="makeCall('${m.phone}')">Call</button>
    <button class="sms-btn" onclick="sendSMS('${m.phone}', 'Check your payment status')">SMS</button>` : 'No contact'}</div></div>`).join('')}</div>`;
}

async function renderAdminReports() {
    const stats = await getStatistics();
    const members = await getFamilyMembers();
    document.getElementById('pageContent').innerHTML = `
        <div class="stats-grid"><div class="stat-card"><div class="stat-number">${members.length}</div><h3>Members</h3></div>
        <div class="stat-card"><div class="stat-number">${_activities.length}</div><h3>Activities</h3></div>
        <div class="stat-card"><div class="stat-number">${stats.totalOwed > 0 ? ((stats.totalCollected / stats.totalOwed * 100)).toFixed(1) : 0}%</div><h3>Overall Progress</h3></div></div>
        <div class="card"><h2>Member Summary <button class="btn-whatsapp" onclick="generateShareableReport()"><i class="fab fa-whatsapp"></i> Share Full Report</button></h2>
        <div style="overflow-x:auto"><table class="data-table"><thead><tr><th>Member</th><th>Role</th><th>Owed</th><th>Paid</th><th>Balance</th><th>Status</th><th>Action</th></tr></thead><tbody>
        ${await Promise.all(members.map(async m => {
            const s = await getUserStatistics(m.id);
            return `<tr><td><strong>${m.name}</strong></td><td>${m.role === 'parent' ? 'Parent' : 'Child'}</td>
                <td>UGX ${s.totalOwed.toLocaleString()}</td><td>UGX ${s.totalPaid.toLocaleString()}</td>
                <td class="${s.balance === 0 ? 'paid-status' : 'unpaid-status'}">UGX ${s.balance.toLocaleString()}</td>
                <td>${s.balance === 0 ? '✅ Settled' : s.balance > 0 ? '❌ Pending' : '✅ Overpaid'}</td>
                <td>${m.phone && s.balance > 0 ? `<button class="sms-btn" onclick="sendSMS('${m.phone}', 'Reminder: Pending UGX ${s.balance.toLocaleString()}')">Remind</button>` : '-'}</td>
            </tr>`;
        }))}
        </tbody>}</table></div></div>
        <div class="card"><h2>Activity Summary</h2><div style="overflow-x:auto"><table class="data-table"><thead><tr><th>Activity</th><th>Budget</th><th>Collected</th><th>Pending</th><th>Progress</th><th>Status</th></tr></thead><tbody>
        ${_activities.map(a => {
            const collected = a.memberPayments?.reduce((sum, mp) => sum + (mp.amount_paid || 0), 0) || 0;
            const pending = a.totalBudget - collected;
            const progress = a.totalBudget > 0 ? (collected / a.totalBudget * 100).toFixed(1) : 0;
            return `<tr><td>${a.name}</td><td>UGX ${a.totalBudget.toLocaleString()}</td>
                <td>UGX ${collected.toLocaleString()}</td><td>UGX ${pending.toLocaleString()}</td>
                <td><div class="progress-bar-container"><div class="progress-bar" style="width:${progress}%">${progress}%</div></div></td>
                <td><span class="badge badge-${a.status}">${a.status}</span></td>
            </tr>`;
        }).join('')}
        </tbody>}</table></div></div>`;
}

async function renderUserReports() {
    const userStats = await getUserStatistics(_currentUser.id);
    const userActivities = await getMemberActivities(_currentUser.id);
    document.getElementById('pageContent').innerHTML = `
        <div class="stats-grid"><div class="stat-card"><div class="stat-number">UGX ${userStats.totalOwed.toLocaleString()}</div><h3>My Owed</h3></div>
        <div class="stat-card"><div class="stat-number">UGX ${userStats.totalPaid.toLocaleString()}</div><h3>My Paid</h3></div>
        <div class="stat-card"><div class="stat-number">UGX ${userStats.balance.toLocaleString()}</div><h3>My Balance</h3></div></div>
        <div class="card"><h2>My Activity Status</h2>
        <div class="activity-grid">${userActivities.map(a => {
            const balance = a.memberData.amountOwed - a.memberData.amountPaid;
            const paidPercent = a.memberData.amountOwed > 0 ? (a.memberData.amountPaid / a.memberData.amountOwed * 100).toFixed(0) : 0;
            return `<div class="activity-card"><h3>${a.name} ${a.status === 'completed' ? '✅' : ''}</h3>
                ${a.status === 'completed' ? '<div class="completion-notification"><i class="fas fa-check-circle"></i> Activity Completed! 🎉</div>' : ''}
                <p>💰 My Share: UGX ${a.memberData.amountOwed.toLocaleString()}</p>
                <p>✅ Paid: UGX ${a.memberData.amountPaid.toLocaleString()}</p>
                <div class="progress-bar-container"><div class="progress-bar" style="width:${paidPercent}%">${paidPercent}% paid</div></div>
                ${balance === 0 ? '<span class="paid-status">✅ Fully paid! Excellent! 🎉</span>' : `<span class="unpaid-status">❌ Pending: UGX ${balance.toLocaleString()}</span>`}
            </div>`;
        }).join('') || '<p>No activities assigned</p>'}</div></div>`;
}

async function renderSecurity() {
    document.getElementById('pageContent').innerHTML = `
        <div class="card"><h2>Security Settings</h2><div style="text-align:center;padding:30px">
            <i class="fas fa-lock" style="font-size:48px;color:var(--primary-orange)"></i>
            <p>Change administrator password</p>
            <button class="btn-primary" onclick="changePassword()">Change Password</button>
        </div></div>
        <div class="card"><h2>System Information</h2>
        <div style="overflow-x:auto"><table class="data-table"><tr><td><strong>Version</strong></td><td>3.0.0</td></tr>
        <tr><td><strong>Database</strong></td><td>Supabase</td></tr>
        <tr><td><strong>Activities</strong></td><td>${_activities.length}</td></tr>
        <tr><td><strong>Members</strong></td><td>${_familyMembers.length}</td></tr></table></div></div>`;
}

async function renderCurrentPage() {
    if (_currentRole === 'admin') {
        if (_currentPage === 'dashboard') await renderAdminDashboard();
        else if (_currentPage === 'activities') await renderAdminActivities();
        else if (_currentPage === 'members') await renderAdminMembers();
        else if (_currentPage === 'payments') await renderAdminPayments();
        else if (_currentPage === 'contacts') await renderContacts();
        else if (_currentPage === 'reports') await renderAdminReports();
        else if (_currentPage === 'security') await renderSecurity();
        else await renderAdminDashboard();
    } else {
        if (_currentPage === 'dashboard') await renderUserDashboard();
        else if (_currentPage === 'myactivities') await renderUserMyActivities();
        else if (_currentPage === 'payments') await renderUserPayments();
        else if (_currentPage === 'contacts') await renderContacts();
        else if (_currentPage === 'reports') await renderUserReports();
        else await renderUserDashboard();
    }
}

// ============================================
// UI FUNCTIONS
// ============================================
function openAddModal() {
    if (_currentRole !== 'admin') { Swal.fire('Access Denied', 'Only administrators can add', 'error'); return; }
    if (_currentPage === 'activities') document.getElementById('addActivityModal').style.display = 'flex';
    else if (_currentPage === 'members') document.getElementById('addMemberModal').style.display = 'flex';
    else if (_currentPage === 'payments') {
        (async () => {
            const acts = (await getActivities()).filter(a => a.status === 'active');
            const members = await getFamilyMembers();
            document.getElementById('paymentActivityId').innerHTML = acts.map(a => `<option value="${a.id}">${a.name} - UGX ${a.totalBudget.toLocaleString()}</option>`).join('');
            document.getElementById('paymentMemberId').innerHTML = members.map(m => `<option value="${m.id}">${m.name} (${m.role})</option>`).join('');
            document.getElementById('paymentModal').style.display = 'flex';
            document.getElementById('paymentDate').value = new Date().toISOString().split('T')[0];
        })();
    }
}

function openEditActivity(id) {
    (async () => {
        const a = (await getActivities()).find(a => a.id === id);
        document.getElementById('editActivityId').value = a.id;
        document.getElementById('editActivityName').value = a.name;
        document.getElementById('editActivityDesc').value = a.description || '';
        document.getElementById('editActivityBudget').value = a.totalBudget;
        document.getElementById('editActivityDueDate').value = a.expectedCompletionDate;
        document.getElementById('editActivityStatus').value = a.status;
        document.getElementById('editActivityModal').style.display = 'flex';
    })();
}

function openEditMember(id) {
    (async () => {
        const m = (await getFamilyMembers()).find(m => m.id === id);
        document.getElementById('editMemberId').value = m.id;
        document.getElementById('editMemberName').value = m.name;
        document.getElementById('editMemberRole').value = m.role;
        document.getElementById('editMemberPhone').value = m.phone || '';
        document.getElementById('editMemberEmail').value = m.email || '';
        document.getElementById('editMemberModal').style.display = 'flex';
    })();
}

function closeModal(id) { document.getElementById(id).style.display = 'none'; }

async function changePassword() {
    Swal.fire({
        title: 'Change Password',
        html: '<input id="newPwd" class="swal2-input" placeholder="New Password"><input id="confirmPwd" class="swal2-input" placeholder="Confirm">',
        preConfirm: () => {
            const pwd = document.getElementById('newPwd').value;
            const confirm = document.getElementById('confirmPwd').value;
            if (pwd !== confirm) { Swal.showValidationMessage('Passwords do not match'); return false; }
            if (pwd.length < 4) { Swal.showValidationMessage('Min 4 characters'); return false; }
            return pwd;
        }
    }).then(async (result) => {
        if (result.isConfirmed) {
            await _supabase.from('admin_settings').upsert({ setting_key: 'admin_password', setting_value: result.value });
            Swal.fire('Success!', 'Password changed', 'success');
        }
    });
}

function switchPage(page) {
    _currentPage = page;
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    if (window.event && window.event.target) window.event.target.closest('.nav-item')?.classList.add('active');
    const titles = { dashboard: 'Dashboard', myactivities: 'My Activities', activities: 'Activities', members: 'Members', payments: 'Payments', contacts: 'Contacts', reports: 'Reports', security: 'Security' };
    document.getElementById('pageTitle').innerHTML = `<i class="fas ${getPageIcon(page)}"></i> ${titles[page]}`;
    const fab = document.getElementById('fabButton');
    if (_currentRole === 'admin' && (page === 'activities' || page === 'members' || page === 'payments')) fab.style.display = 'flex';
    else fab.style.display = 'none';
    renderCurrentPage();
}

function getPageIcon(page) {
    const icons = { dashboard: 'fa-tachometer-alt', myactivities: 'fa-list', activities: 'fa-tasks', members: 'fa-users', payments: 'fa-money-bill-wave', contacts: 'fa-address-book', reports: 'fa-chart-bar', security: 'fa-shield-alt' };
    return icons[page] || 'fa-folder';
}

function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('collapsed');
    document.querySelector('.main-content').classList.toggle('expanded');
}

// ============================================
// AUTHENTICATION
// ============================================
function selectRole(role) {
    _selectedRole = role;
    document.getElementById('adminRoleBtn').style.borderColor = role === 'admin' ? '#ff862d' : '#e0e0e0';
    document.getElementById('userRoleBtn').style.borderColor = role === 'user' ? '#ff862d' : '#e0e0e0';
    document.getElementById('adminPasswordDiv').style.display = role === 'admin' ? 'block' : 'none';
    document.getElementById('userSelectDiv').style.display = role === 'user' ? 'block' : 'none';
}

async function confirmLogin() {
    const { data: adminSetting } = await _supabase.from('admin_settings').select('setting_value').eq('setting_key', 'admin_password').single();
    const storedPwd = adminSetting?.setting_value || 'admin123';
    
    if (_selectedRole === 'admin') {
        const pwd = document.getElementById('adminPassword').value;
        if (pwd === storedPwd) {
            _currentRole = 'admin';
            _currentUser = { id: 0, name: 'Administrator' };
            showAdminDashboard();
        } else {
            Swal.fire('Error', 'Invalid password! Default: admin123', 'error');
        }
    } else if (_selectedRole === 'user') {
        const userId = parseInt(document.getElementById('userSelect').value);
        if (!userId) { Swal.fire('Error', 'Please select your name', 'error'); return; }
        const user = _familyMembers.find(m => m.id === userId);
        if (user) {
            _currentRole = 'user';
            _currentUser = user;
            showUserDashboard();
        } else {
            Swal.fire('Error', 'User not found', 'error');
        }
    } else {
        Swal.fire('Error', 'Please select a role', 'error');
    }
}

function showAdminDashboard() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('appContainer').style.display = 'block';
    document.getElementById('userNameDisplay').innerHTML = '👑 Administrator';
    document.getElementById('roleBadge').innerHTML = 'Full Access';
    document.getElementById('sidebarUserName').innerHTML = 'Admin';
    document.getElementById('viewOnlyBanner').style.display = 'none';
    document.getElementById('fabButton').style.display = 'flex';
    document.getElementById('myActivitiesNav').style.display = 'none';
    document.getElementById('activitiesNav').style.display = 'flex';
    document.getElementById('membersNav').style.display = 'flex';
    document.getElementById('paymentsNav').style.display = 'flex';
    document.getElementById('reportsNav').style.display = 'flex';
    document.getElementById('securityNav').style.display = 'flex';
    _currentPage = 'dashboard';
    setupRealtimeNotifications();
    renderCurrentPage();
    queueToast('👋 Welcome Admin', 'You have full control over the system.', 'success', 4000);
}

function showUserDashboard() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('appContainer').style.display = 'block';
    document.getElementById('userNameDisplay').innerHTML = `👤 ${_currentUser.name}`;
    document.getElementById('roleBadge').innerHTML = 'View Only';
    document.getElementById('sidebarUserName').innerHTML = _currentUser.name;
    document.getElementById('viewOnlyBanner').style.display = 'block';
    document.getElementById('fabButton').style.display = 'none';
    document.getElementById('myActivitiesNav').style.display = 'flex';
    document.getElementById('activitiesNav').style.display = 'none';
    document.getElementById('membersNav').style.display = 'none';
    document.getElementById('paymentsNav').style.display = 'flex';
    document.getElementById('reportsNav').style.display = 'flex';
    document.getElementById('securityNav').style.display = 'none';
    _currentPage = 'dashboard';
    setupRealtimeNotifications();
    renderCurrentPage();
    queueToast(`👋 Welcome ${_currentUser.name}`, 'You can view your activities and payment status.', 'info', 4000);
}

function logout() {
    if (_realtimeSubscription) {
        _supabase.removeChannel(_realtimeSubscription);
        _realtimeSubscription = null;
    }
    _currentRole = null;
    _currentUser = null;
    document.getElementById('appContainer').style.display = 'none';
    document.getElementById('loginScreen').style.display = 'block';
    document.getElementById('adminPassword').value = '';
    document.getElementById('userSelect').value = '';
}

// ============================================
// SERVICE WORKER / PWA
// ============================================
async function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        try {
            const registration = await navigator.serviceWorker.register('/sw.js');
            console.log('Service Worker registered:', registration);
        } catch (error) {
            console.error('Service Worker registration failed:', error);
        }
    }
}

// ============================================
// EVENT LISTENERS
// ============================================
document.getElementById('addActivityForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (await createActivity(activityName.value, activityDesc.value, parseFloat(activityBudget.value), activityDueDate.value)) {
        closeModal('addActivityModal');
        e.target.reset();
        await renderCurrentPage();
    }
});

document.getElementById('addMemberForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (await addMember(memberName.value, memberRole.value, memberPhone.value, memberEmail.value)) {
        closeModal('addMemberModal');
        e.target.reset();
        await renderCurrentPage();
    }
});

document.getElementById('editMemberForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (await updateMember(parseInt(editMemberId.value), editMemberName.value, editMemberRole.value, editMemberPhone.value, editMemberEmail.value)) {
        closeModal('editMemberModal');
        await renderCurrentPage();
    }
});

document.getElementById('paymentForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (await recordPayment(parseInt(paymentActivityId.value), parseInt(paymentMemberId.value), parseFloat(paymentAmount.value), paymentDate.value, paymentNotes.value)) {
        closeModal('paymentModal');
        e.target.reset();
        await renderCurrentPage();
    }
});

document.getElementById('editActivityForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (await updateActivity(parseInt(editActivityId.value), editActivityName.value, editActivityDesc.value, parseFloat(editActivityBudget.value), editActivityDueDate.value, editActivityStatus.value)) {
        closeModal('editActivityModal');
        await renderCurrentPage();
    }
});

// Expose global functions
window.selectRole = selectRole;
window.confirmLogin = confirmLogin;
window.logout = logout;
window.switchPage = switchPage;
window.toggleSidebar = toggleSidebar;
window.openAddModal = openAddModal;
window.closeModal = closeModal;
window.openEditActivity = openEditActivity;
window.openEditMember = openEditMember;
window.deleteActivity = deleteActivity;
window.deleteMember = deleteMember;
window.sendWhatsApp = sendWhatsApp;
window.makeCall = makeCall;
window.sendSMS = sendSMS;
window.generateShareableReport = generateShareableReport;
window.sendWhatsAppToAll = sendWhatsAppToAll;
window.changePassword = changePassword;
window.showActivityDetails = showActivityDetails;
window.closeToast = closeToast;