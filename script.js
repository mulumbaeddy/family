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
    showToast(title, message, type, duration);
    setTimeout(() => {
        isShowingToast = false;
        processToastQueue();
    }, duration + 500);
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
        checkBirthdays();
    } catch (error) {
        document.getElementById('loadingStatus').innerText = 'Error: ' + error.message;
        console.error('Init error:', error);
    }
})();

async function loadData() {
    try {
        console.log('🔄 Loading data...');
        
        const { data: members, error: membersError } = await _supabase
            .from('family_members')
            .select('*')
            .order('name');
        
        if (membersError) throw membersError;
        
        // IMPORTANT: Map profile_picture_url correctly
        _familyMembers = members.map(member => ({
            ...member,
            profile_picture_url: member.profile_picture_url || null,
            phone: member.phone || '',
            email: member.email || '',
            location: member.location || '',
            bio: member.bio || '',
            occupation: member.occupation || ''
        }));
        
        console.log(`✅ Loaded ${_familyMembers.length} members`);
        
        // Debug: Log profile pictures
        _familyMembers.forEach(m => {
            if (m.profile_picture_url) {
                console.log(`📸 ${m.name} has picture: ${m.profile_picture_url.substring(0, 50)}...`);
            } else {
                console.log(`❌ ${m.name} has NO picture`);
            }
        });
        
        // Load activities and other data...
        const { data: activities, error: activitiesError } = await _supabase
            .from('activities')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (activitiesError) throw activitiesError;
        
        _activities = activities || [];
        
        // Populate user dropdown
        const userSelect = document.getElementById('userSelect');
        if (userSelect && _familyMembers.length > 0) {
            userSelect.innerHTML = `
                <option value="">📋 Select your name...</option>
                ${_familyMembers.map(m => `
                    <option value="${m.id}">
                        ${m.member_type === 'board' ? '👑 ' : ''}${m.name}
                    </option>
                `).join('')}
            `;
        }
        
        return true;
        
    } catch (error) {
        console.error('❌ Error loading data:', error);
        return false;
    }
}
// ============================================
// IMAGE PREVIEW FUNCTIONS
// ============================================
// REPLACE your old previewAddImage with this:
// ============================================
// COMPLETE WORKING PICTURE FUNCTIONS
// ============================================

// Preview and compress image for Add Member
// Updated preview functions (same as before)
async function previewAddImage(input) {
    if (input.files && input.files[0]) {
        const file = input.files[0];
        
        // Show preview
        const reader = new FileReader();
        reader.onload = function(e) {
            const preview = document.getElementById('addImagePreview');
            preview.innerHTML = `<img src="${e.target.result}" alt="Preview" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
        };
        reader.readAsDataURL(file);
        
        // Store the file
        window._addImageFile = file;
    }
}

async function previewEditImage(input) {
    if (input.files && input.files[0]) {
        const file = input.files[0];
        
        // Show preview
        const reader = new FileReader();
        reader.onload = function(e) {
            const preview = document.getElementById('editImagePreview');
            preview.innerHTML = `<img src="${e.target.result}" alt="Preview" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
        };
        reader.readAsDataURL(file);
        
        // Store the file
        window._editImageFile = file;
    }
}
// Compress image function
async function compressImage(file, maxWidth = 200, maxHeight = 200, quality = 0.6) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (e) => {
            const img = new Image();
            img.src = e.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                
                if (width > height) {
                    if (width > maxWidth) {
                        height = (height * maxWidth) / width;
                        width = maxWidth;
                    }
                } else {
                    if (height > maxHeight) {
                        width = (width * maxHeight) / height;
                        height = maxHeight;
                    }
                }
                
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                
                canvas.toBlob((blob) => {
                    resolve(blob);
                }, 'image/jpeg', quality);
            };
        };
        reader.onerror = error => reject(error);
    });
}

// Upload image to Supabase Storage
// ============================================
// UPDATED STORAGE FUNCTIONS WITH NEW BUCKET
// ============================================

// Upload image to new bucket
async function uploadProfilePicture(file, memberId) {
    try {
        const fileExt = file.name.split('.').pop();
        const fileName = `member_${memberId}_${Date.now()}.${fileExt}`;
        
        console.log('Uploading to family-photos bucket...');
        
        const { data, error } = await _supabase.storage
            .from('family-photos')  // NEW BUCKET NAME
            .upload(fileName, file, {
                cacheControl: '3600',
                upsert: true,
                contentType: file.type
            });
        
        if (error) {
            console.error('Upload error:', error);
            return null;
        }
        
        // Get public URL
        const { data: { publicUrl } } = _supabase.storage
            .from('family-photos')  // NEW BUCKET NAME
            .getPublicUrl(fileName);
        
        console.log('Upload successful! URL:', publicUrl);
        
        // Save URL to database
        const { error: updateError } = await _supabase
            .from('family_members')
            .update({ profile_picture_url: publicUrl })
            .eq('id', memberId);
        
        if (updateError) {
            console.error('Failed to save URL:', updateError);
            return null;
        }
        
        return publicUrl;
        
    } catch (error) {
        console.error('Upload error:', error);
        return null;
    }
}

// Delete old profile picture from new bucket
async function deleteOldProfilePicture(oldUrl) {
    if (!oldUrl) return;
    
    try {
        const fileName = oldUrl.split('/').pop();
        if (fileName && fileName.includes('member_')) {
            await _supabase.storage
                .from('family-photos')  // NEW BUCKET NAME
                .remove([fileName]);
            console.log('Old picture deleted:', fileName);
        }
    } catch (error) {
        console.error('Delete error:', error);
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
                    status: memberData.status,
                    adjustmentAmount: memberData.adjustment_amount || 0,
                    adjustmentReason: memberData.adjustment_reason
                }
            });
        }
    }
    return memberActivities;
}

async function getMemberPayments(memberId) {
    const { data: payments, error } = await _supabase
        .from('payments')
        .select(`
            *,
            activities(name)
        `)
        .eq('member_id', memberId)
        .order('payment_date', { ascending: false });
    
    if (error) {
        console.error('Error fetching member payments:', error);
        return [];
    }
    
    return payments.map(p => ({
        ...p,
        activityName: p.activities?.name || 'Unknown'
    }));
}

async function getAllPayments() {
    // Fetch payments with a single query instead of looping through activities
    const { data: payments, error } = await _supabase
        .from('payments')
        .select(`
            *,
            family_members(name),
            activities(name)
        `)
        .order('payment_date', { ascending: false });
    
    if (error) {
        console.error('Error fetching payments:', error);
        return [];
    }
    
    // Format the payments
    return payments.map(p => ({
        ...p,
        memberName: p.family_members?.name || 'Unknown',
        activityName: p.activities?.name || 'Unknown'
    }));
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
// PAYMENT RESPONSIBILITY HELPER
// ============================================
function getPaymentResponsibleMember(member) {
    if (!member) return null;
    // Board members and parents pay for themselves
    if (member.member_type === 'board' || member.member_type === 'parent') return member;
    // Dependents and children have responsible payers
    if (member.payment_responsible_id) {
        const responsible = _familyMembers.find(m => m.id === member.payment_responsible_id);
        if (responsible) return responsible;
    }
    if (member.parent_id) {
        const parent = _familyMembers.find(m => m.id === member.parent_id);
        if (parent) return parent;
    }
    return member;
}

// Get paying members (only those who actually pay - board members and parents, NOT dependents)
function getPayingMembers() {
    return _familyMembers.filter(m => m.member_type === 'board' || m.member_type === 'parent');
}

// ============================================
// ADJUSTMENT FUNCTIONS
// ============================================
async function openAdjustmentModal(activityId, memberId) {
    const activity = _activities.find(a => a.id === activityId);
    const member = _familyMembers.find(m => m.id === memberId);
    const memberActivity = activity?.memberPayments?.find(mp => mp.member_id === memberId);
    
    if (!activity || !member) return;
    
    const result = await Swal.fire({
        title: `Adjust Payment for ${member.name}`,
        html: `
            <div style="text-align: left;">
                <p><strong>Activity:</strong> ${activity.name}</p>
                <p><strong>Current Amount Owed:</strong> UGX ${(memberActivity?.amount_owed || 0).toLocaleString()}</p>
                <p><strong>Current Amount Paid:</strong> UGX ${(memberActivity?.amount_paid || 0).toLocaleString()}</p>
                <hr>
                <div class="form-group">
                    <label>Adjustment Amount (UGX)</label>
                    <input type="number" id="adjustmentAmount" class="swal2-input" placeholder="Enter adjustment amount" style="width: 100%;">
                </div>
                <div class="form-group">
                    <label>Adjustment Type</label>
                    <select id="adjustmentType" class="swal2-select" style="width: 100%;">
                        <option value="increase">Increase Amount Owed (+)</option>
                        <option value="decrease">Decrease Amount Owed (-)</option>
                        <option value="waive">Waive/Remove Amount</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Reason for Adjustment</label>
                    <textarea id="adjustmentReason" class="swal2-textarea" rows="3" placeholder="e.g., Special consideration, discount, extra contribution..."></textarea>
                </div>
            </div>
        `,
        focusConfirm: false,
        preConfirm: () => {
            const amount = parseFloat(document.getElementById('adjustmentAmount').value);
            const type = document.getElementById('adjustmentType').value;
            const reason = document.getElementById('adjustmentReason').value;
            
            if (isNaN(amount) || amount <= 0) {
                Swal.showValidationMessage('Please enter a valid amount');
                return false;
            }
            if (!reason) {
                Swal.showValidationMessage('Please provide a reason for the adjustment');
                return false;
            }
            return { amount, type, reason };
        },
        showCancelButton: true,
        confirmButtonText: 'Apply Adjustment',
        cancelButtonText: 'Cancel'
    });
    
    if (result.isConfirmed) {
        await applyAdjustment(activityId, memberId, result.value.amount, result.value.type, result.value.reason);
    }
}

async function applyAdjustment(activityId, memberId, amount, type, reason) {
    if (_currentRole !== 'admin') {
        Swal.fire('Access Denied', 'Only administrators can make adjustments', 'error');
        return false;
    }
    
    const memberActivity = _activities
        .find(a => a.id === activityId)
        ?.memberPayments?.find(mp => mp.member_id === memberId);
    
    if (!memberActivity) {
        Swal.fire('Error', 'Member activity record not found', 'error');
        return false;
    }
    
    let newAmountOwed = memberActivity.amount_owed;
    
    if (type === 'increase') {
        newAmountOwed += amount;
    } else if (type === 'decrease') {
        newAmountOwed = Math.max(0, newAmountOwed - amount);
    } else if (type === 'waive') {
        newAmountOwed = 0;
    }
    
    const { error } = await _supabase
        .from('member_activities')
        .update({ 
            amount_owed: newAmountOwed,
            adjustment_amount: amount,
            adjustment_reason: reason
        })
        .eq('activity_id', activityId)
        .eq('member_id', memberId);
    
    if (error) {
        Swal.fire('Error', error.message, 'error');
        return false;
    }
    
    // Record adjustment in payment_adjustments table
    await _supabase.from('payment_adjustments').insert({
        member_id: memberId,
        activity_id: activityId,
        adjustment_amount: amount,
        adjustment_type: type,
        reason: reason,
        approved_by: _currentUser?.id || 0
    });
    
    await loadData();
    await renderCurrentPage();
    
    queueToast('💰 Adjustment Applied', `Amount adjusted by UGX ${amount.toLocaleString()} (${type})`, 'warning', 4000);
    Swal.fire('Success!', 'Payment adjustment has been applied.', 'success');
    return true;
}

// ============================================
// DELETE PAYMENT FUNCTION
// ============================================
async function deletePayment(paymentId) {
    if (_currentRole !== 'admin') {
        Swal.fire('Access Denied', 'Only administrators can delete payments', 'error');
        return false;
    }
    
    const result = await Swal.fire({
        title: 'Delete Payment?',
        text: 'This action cannot be undone. Are you sure?',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#e74c3c',
        cancelButtonColor: '#95a5a6',
        confirmButtonText: 'Yes, delete it!',
        cancelButtonText: 'Cancel'
    });
    
    if (!result.isConfirmed) return false;
    
    try {
        const { data: payment, error: paymentError } = await _supabase
            .from('payments')
            .select('*')
            .eq('id', paymentId)
            .single();
        
        if (paymentError || !payment) {
            Swal.fire('Error', 'Payment not found.', 'error');
            return false;
        }
        
        const activityId = payment.activity_id;
        const memberId = payment.member_id;
        const amount = payment.amount;
        
        const { error: deleteError } = await _supabase
            .from('payments')
            .delete()
            .eq('id', paymentId);
        
        if (deleteError) {
            Swal.fire('Error', deleteError.message, 'error');
            return false;
        }
        
        const { data: memberActivity } = await _supabase
            .from('member_activities')
            .select('*')
            .eq('activity_id', activityId)
            .eq('member_id', memberId)
            .single();
        
        if (memberActivity) {
            const newPaid = (memberActivity.amount_paid || 0) - amount;
            let status = 'unpaid';
            if (newPaid >= memberActivity.amount_owed) status = 'paid';
            else if (newPaid > 0) status = 'partial';
            
            await _supabase
                .from('member_activities')
                .update({ amount_paid: newPaid, status })
                .eq('activity_id', activityId)
                .eq('member_id', memberId);
            
            const { data: allMemberActivities } = await _supabase
                .from('member_activities')
                .select('status')
                .eq('activity_id', activityId);
            
            const allPaid = allMemberActivities?.every(ma => ma.status === 'paid');
            if (!allPaid && allMemberActivities && allMemberActivities.length > 0) {
                await _supabase
                    .from('activities')
                    .update({ status: 'active' })
                    .eq('id', activityId);
            }
        }
        
        await loadData();
        await renderCurrentPage();
        queueToast('✅ Payment Deleted', 'Payment removed successfully', 'success', 3000);
        Swal.fire('Deleted!', 'Payment has been deleted.', 'success');
        return true;
    } catch (error) {
        console.error('Unexpected error:', error);
        Swal.fire('Error', 'An unexpected error occurred', 'error');
        return false;
    }
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
    
    // Get ONLY paying members (board members and parents, NOT dependents)
    const payingMembers = members.filter(m => m.member_type === 'board' || m.member_type === 'parent');
    const numberOfPayers = payingMembers.length;
    
    if (numberOfPayers === 0) {
        Swal.fire('Error', 'No paying members found. Please add at least one parent or board member.', 'error');
        return false;
    }
    
    const { data: activity, error } = await _supabase
        .from('activities')
        .insert({ name, description: desc, total_budget: parseFloat(budget), expected_completion_date: dueDate, status: 'active' })
        .select();
    
    if (error) { Swal.fire('Error', error.message, 'error'); return false; }
    
    const activityId = activity[0].id;
    const amountPerPayer = parseFloat(budget) / numberOfPayers;
    
    // For each paying member, create a member_activity record
    for (const payer of payingMembers) {
        // Find all dependents under this payer (including themselves)
        const dependents = members.filter(m => {
            const responsible = getPaymentResponsibleMember(m);
            return responsible && responsible.id === payer.id;
        });
        
        // If no dependents, just the payer themselves
        if (dependents.length === 0) {
            await _supabase.from('member_activities').insert({
                activity_id: activityId,
                member_id: payer.id,
                amount_owed: amountPerPayer,
                amount_paid: 0,
                status: 'unpaid'
            });
        } else {
            // Split the payer's share among all dependents (including payer)
            const sharePerDependent = amountPerPayer / dependents.length;
            for (const dependent of dependents) {
                await _supabase.from('member_activities').insert({
                    activity_id: activityId,
                    member_id: dependent.id,
                    amount_owed: sharePerDependent,
                    amount_paid: 0,
                    status: 'unpaid'
                });
            }
        }
    }
    
    await loadData();
    
    let message = `✅ "${name}" created. `;
    for (const payer of payingMembers) {
        const dependents = members.filter(m => {
            const responsible = getPaymentResponsibleMember(m);
            return responsible && responsible.id === payer.id;
        });
        message += `${payer.name}: UGX ${amountPerPayer.toLocaleString()} `;
    }
    
    queueToast('✅ Activity Created', message, 'success', 6000);
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
    
    await recalculateActivityShares(id, parseFloat(budget));
    await loadData();
    await renderCurrentPage();
    Swal.fire('Updated!', 'Activity updated successfully', 'success');
    return true;
}

async function recalculateActivityShares(activityId, newBudget) {
    const members = await getFamilyMembers();
    const payingMembers = members.filter(m => m.member_type === 'board' || m.member_type === 'parent');
    const numberOfPayers = payingMembers.length;
    
    if (numberOfPayers === 0) return;
    
    const amountPerPayer = newBudget / numberOfPayers;
    
    for (const payer of payingMembers) {
        const dependents = members.filter(m => {
            const responsible = getPaymentResponsibleMember(m);
            return responsible && responsible.id === payer.id;
        });
        
        const sharePerDependent = dependents.length > 0 ? amountPerPayer / dependents.length : amountPerPayer;
        
        for (const dependent of dependents) {
            await _supabase
                .from('member_activities')
                .update({ amount_owed: sharePerDependent })
                .eq('activity_id', activityId)
                .eq('member_id', dependent.id);
        }
    }
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

async function addMember(name, role, phone, email, profilePictureFile, dob, bloodGroup, allergies, 
    emergencyContact, occupation, location, maritalStatus, anniversary, bio, favoriteColor,
    memberType, boardPosition, parentId) {
    
    if (_currentRole !== 'admin') { 
        Swal.fire('Access Denied', 'Only administrators can add members', 'error'); 
        return false; 
    }
    
    // Insert member first without picture
    const { data: member, error } = await _supabase
        .from('family_members')
        .insert({ 
            name, 
            role: (memberType === 'board' || memberType === 'parent') ? 'parent' : 'child',
            phone: phone || null,
            email: email || null,
            date_of_birth: dob || null,
            blood_group: bloodGroup || null,
            allergies: allergies || null,
            emergency_contact: emergencyContact || null,
            occupation: occupation || null,
            location: location || null,
            marital_status: maritalStatus || null,
            anniversary_date: anniversary || null,
            bio: bio || null,
            favorite_color: favoriteColor || '#01605a',
            member_type: memberType,
            parent_id: parentId || null,
            payment_responsible_id: (memberType === 'child' || memberType === 'dependent') ? parentId : null,
            is_board_member: memberType === 'board',
            board_position: boardPosition || null,
            can_approve_payments: memberType === 'board'
        })
        .select()
        .single();
    
    if (error) { 
        Swal.fire('Error', error.message, 'error'); 
        return false; 
    }
    
    // Upload profile picture if provided
    if (profilePictureFile) {
        const pictureUrl = await uploadProfilePicture(profilePictureFile, member.id);
        if (pictureUrl) {
            await _supabase
                .from('family_members')
                .update({ profile_picture_url: pictureUrl })
                .eq('id', member.id);
        }
    }
    
    await loadData();
    Swal.fire('Success!', `${name} added to family.`, 'success');
    return true;
}

// Updated Update Member
async function updateMember(id, name, role, phone, email, profilePictureFile, dob, bloodGroup, allergies, 
    emergencyContact, occupation, location, maritalStatus, anniversary, bio, favoriteColor,
    memberType, boardPosition, parentId) {
    
    if (_currentRole !== 'admin') { 
        Swal.fire('Access Denied', 'Only administrators can edit members', 'error'); 
        return false; 
    }
    
    // Get current member
    const { data: currentMember } = await _supabase
        .from('family_members')
        .select('profile_picture_url')
        .eq('id', id)
        .single();
    
    let pictureUrl = currentMember?.profile_picture_url;
    
    // Upload new picture if provided
    if (profilePictureFile) {
        if (pictureUrl) {
            await deleteOldProfilePicture(pictureUrl);
        }
        pictureUrl = await uploadProfilePicture(profilePictureFile, id);
    }
    
    const updateData = { 
        name, 
        role: (memberType === 'board' || memberType === 'parent') ? 'parent' : 'child',
        phone: phone || null,
        email: email || null,
        date_of_birth: dob || null,
        blood_group: bloodGroup || null,
        allergies: allergies || null,
        emergency_contact: emergencyContact || null,
        occupation: occupation || null,
        location: location || null,
        marital_status: maritalStatus || null,
        anniversary_date: anniversary || null,
        bio: bio || null,
        favorite_color: favoriteColor || '#01605a',
        member_type: memberType,
        parent_id: parentId || null,
        payment_responsible_id: (memberType === 'child' || memberType === 'dependent') ? parentId : null,
        is_board_member: memberType === 'board',
        board_position: boardPosition || null,
        can_approve_payments: memberType === 'board'
    };
    
    if (pictureUrl) {
        updateData.profile_picture_url = pictureUrl;
    }
    
    const { error } = await _supabase
        .from('family_members')
        .update(updateData)
        .eq('id', id);
    
    if (error) { 
        throw new Error(error.message);
    }
    
    await loadData();
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
        
        // Recalculate all active activity shares
        const activeActivities = _activities.filter(a => a.status === 'active');
        for (const activity of activeActivities) {
            await recalculateActivityShares(activity.id, activity.totalBudget);
        }
        
        await loadData();
        await renderCurrentPage();
        Swal.fire('Removed!', 'Member has been removed.', 'success');
    }
}

// ============================================
// RECORD PAYMENT WITH AUTO-COMPLETION AND WAIVE
// ============================================
async function recordPayment(activityId, memberId, amount, date, notes) {
    if (_currentRole !== 'admin') { 
        Swal.fire('Access Denied', 'Only administrators can record payments', 'error'); 
        return false; 
    }
    
    const member = _familyMembers.find(m => m.id === memberId);
    const activity = _activities.find(a => a.id === activityId);
    
    // Check if activity is already completed
    if (activity.status === 'completed') {
        Swal.fire('Activity Completed', 'This activity is already completed. No more payments can be recorded.', 'warning');
        return false;
    }
    
    const { error } = await _supabase.from('payments').insert({ 
        activity_id: activityId, 
        member_id: memberId, 
        amount: parseFloat(amount), 
        payment_date: date, 
        notes,
        recorded_by: _currentUser?.name || 'Admin'
    });
    
    if (error) { Swal.fire('Error', error.message, 'error'); return false; }
    
    const { data: memberActivity } = await _supabase
        .from('member_activities')
        .select('*')
        .eq('activity_id', activityId)
        .eq('member_id', memberId)
        .single();
    
    const newPaid = (memberActivity?.amount_paid || 0) + parseFloat(amount);
    let status = 'unpaid';
    if (newPaid >= memberActivity.amount_owed) status = 'paid';
    else if (newPaid > 0) status = 'partial';
    
    await _supabase
        .from('member_activities')
        .update({ amount_paid: newPaid, status })
        .eq('activity_id', activityId)
        .eq('member_id', memberId);
    
    // Check if all members have paid
    const { data: allMemberActivities } = await _supabase
        .from('member_activities')
        .select('*')
        .eq('activity_id', activityId);
    
    // Calculate if all members have zero balance (paid or waived)
    let allSettled = true;
    let membersWithBalance = [];
    
    for (const ma of allMemberActivities) {
        const balance = (ma.amount_owed || 0) - (ma.amount_paid || 0);
        if (balance > 0) {
            allSettled = false;
            membersWithBalance.push({ memberId: ma.member_id, balance: balance });
        }
    }
    
    // If all members have settled (balance <= 0), mark as completed
    if (allSettled) {
        await completeActivityAndWaiveBalances(activityId, membersWithBalance);
        queueToast('🎉 Activity Completed!', `"${activity?.name}" is now fully paid and completed!`, 'success', 6000);
    }
    
    queueToast('💰 Payment Recorded', `${member?.name} paid UGX ${parseFloat(amount).toLocaleString()} for "${activity?.name}"`, 'success', 4000);
    await loadData();
    Swal.fire('Success!', 'Payment recorded successfully', 'success');
    return true;
}

// ============================================
// COMPLETE ACTIVITY AND WAIVE OUTSTANDING BALANCES
// ============================================
async function completeActivityAndWaiveBalances(activityId, membersWithBalance = null) {
    // Get all member activities for this activity if not provided
    if (!membersWithBalance) {
        const { data: allMemberActivities } = await _supabase
            .from('member_activities')
            .select('*')
            .eq('activity_id', activityId);
        
        membersWithBalance = [];
        for (const ma of allMemberActivities) {
            const balance = (ma.amount_owed || 0) - (ma.amount_paid || 0);
            if (balance > 0) {
                membersWithBalance.push({ memberId: ma.member_id, balance: balance });
            }
        }
    }
    
    // Waive outstanding balances for members who still owe money
    for (const member of membersWithBalance) {
        // Get the member activity record
        const { data: memberActivity } = await _supabase
            .from('member_activities')
            .select('*')
            .eq('activity_id', activityId)
            .eq('member_id', member.memberId)
            .single();
        
        if (memberActivity && memberActivity.amount_owed > memberActivity.amount_paid) {
            const waivedAmount = memberActivity.amount_owed - memberActivity.amount_paid;
            
            // Update the member's owed amount to match what they paid (waive the balance)
            await _supabase
                .from('member_activities')
                .update({ 
                    amount_owed: memberActivity.amount_paid,
                    adjustment_amount: waivedAmount,
                    adjustment_reason: 'Auto-waived on activity completion',
                    status: 'paid'
                })
                .eq('activity_id', activityId)
                .eq('member_id', member.memberId);
            
            // Record the waiver as an adjustment
            const waivedMember = _familyMembers.find(m => m.id === member.memberId);
            await _supabase.from('payment_adjustments').insert({
                member_id: member.memberId,
                activity_id: activityId,
                adjustment_amount: waivedAmount,
                adjustment_type: 'waive',
                reason: `Auto-waived remaining balance of UGX ${waivedAmount.toLocaleString()} upon activity completion`,
                approved_by: _currentUser?.id || 0
            });
            
            queueToast('💰 Balance Waived', `${waivedMember?.name} had UGX ${waivedAmount.toLocaleString()} waived on completion`, 'warning', 5000);
        }
    }
    
    // Mark activity as completed
    await _supabase
        .from('activities')
        .update({ status: 'completed' })
        .eq('id', activityId);
    
    return true;
}

// ============================================
// MANUAL COMPLETE ACTIVITY (Admin triggered)
// ============================================
async function manuallyCompleteActivity(activityId) {
    if (_currentRole !== 'admin') {
        Swal.fire('Access Denied', 'Only administrators can complete activities', 'error');
        return false;
    }
    
    const activity = _activities.find(a => a.id === activityId);
    if (!activity) return false;
    
    // Check for members with outstanding balances
    const { data: allMemberActivities } = await _supabase
        .from('member_activities')
        .select('*, family_members(name)')
        .eq('activity_id', activityId);
    
    const membersWithBalance = [];
    for (const ma of allMemberActivities) {
        const balance = (ma.amount_owed || 0) - (ma.amount_paid || 0);
        if (balance > 0) {
            membersWithBalance.push({ 
                memberId: ma.member_id, 
                balance: balance,
                name: ma.family_members?.name || 'Unknown'
            });
        }
    }
    
    // Show confirmation with list of members whose balances will be waived
    if (membersWithBalance.length > 0) {
        const memberList = membersWithBalance.map(m => `• ${m.name}: UGX ${m.balance.toLocaleString()}`).join('\n');
        
        const result = await Swal.fire({
            title: 'Complete Activity?',
            html: `
                <div style="text-align: left;">
                    <p><strong>Activity:</strong> ${activity.name}</p>
                    <p><strong>Total Budget:</strong> UGX ${(activity.totalBudget || 0).toLocaleString()}</p>
                    <p><strong>Total Collected:</strong> UGX ${(activity.totalBudget - membersWithBalance.reduce((sum, m) => sum + m.balance, 0)).toLocaleString()}</p>
                    <hr>
                    <p><strong>The following members have outstanding balances that will be WAIVED:</strong></p>
                    <pre style="background: #fff3cd; padding: 10px; border-radius: 5px;">${memberList}</pre>
                    <p style="color: var(--danger);"><strong>⚠️ Warning:</strong> This action cannot be undone. All outstanding balances will be set to zero.</p>
                </div>
            `,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#e74c3c',
            cancelButtonColor: '#95a5a6',
            confirmButtonText: 'Yes, Complete & Waive Balances',
            cancelButtonText: 'Cancel'
        });
        
        if (!result.isConfirmed) return false;
    } else {
        const result = await Swal.fire({
            title: 'Complete Activity?',
            text: `"${activity.name}" has no outstanding balances. Mark as completed?`,
            icon: 'question',
            showCancelButton: true,
            confirmButtonColor: '#27ae60',
            cancelButtonColor: '#95a5a6',
            confirmButtonText: 'Yes, Complete',
            cancelButtonText: 'Cancel'
        });
        
        if (!result.isConfirmed) return false;
    }
    
    // Complete activity and waive balances
    await completeActivityAndWaiveBalances(activityId, membersWithBalance);
    
    await loadData();
    await renderCurrentPage();
    
    const waivedCount = membersWithBalance.length;
    if (waivedCount > 0) {
        queueToast('✅ Activity Completed', `"${activity.name}" completed. ${waivedCount} member(s) had balances waived.`, 'success', 6000);
        Swal.fire('Completed!', `Activity "${activity.name}" has been completed. ${waivedCount} member(s) had their outstanding balances waived.`, 'success');
    } else {
        queueToast('✅ Activity Completed', `"${activity.name}" has been completed.`, 'success', 4000);
        Swal.fire('Completed!', `Activity "${activity.name}" has been completed.`, 'success');
    }
    
    return true;
}

// ============================================
// UPDATE EDIT ACTIVITY TO HANDLE COMPLETION
// ============================================
async function updateActivity(id, name, desc, budget, dueDate, status) {
    if (_currentRole !== 'admin') { 
        Swal.fire('Access Denied', 'Only administrators can edit activities', 'error'); 
        return false; 
    }
    
    const oldActivity = _activities.find(a => a.id === id);
    
    // If changing status to completed, trigger the completion process
    if (status === 'completed' && oldActivity?.status !== 'completed') {
        const result = await Swal.fire({
            title: 'Complete Activity?',
            text: `Are you sure you want to mark "${name}" as completed? Any outstanding balances will be waived.`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#e74c3c',
            cancelButtonColor: '#95a5a6',
            confirmButtonText: 'Yes, Complete & Waive',
            cancelButtonText: 'Cancel'
        });
        
        if (!result.isConfirmed) {
            // Reset status back to active if user cancels
            document.getElementById('editActivityStatus').value = 'active';
            return false;
        }
        
        // Complete the activity and waive balances
        await completeActivityAndWaiveBalances(id);
        
        // Update the activity with new data
        const { error } = await _supabase
            .from('activities')
            .update({ name, description: desc, total_budget: parseFloat(budget), expected_completion_date: dueDate, status: 'completed' })
            .eq('id', id);
        
        if (error) { Swal.fire('Error', error.message, 'error'); return false; }
        
        queueToast('🎉 Activity Completed!', `"${name}" has been completed. Outstanding balances waived.`, 'success', 6000);
    } else {
        // Normal update without completion
        const { error } = await _supabase
            .from('activities')
            .update({ name, description: desc, total_budget: parseFloat(budget), expected_completion_date: dueDate, status })
            .eq('id', id);
        
        if (error) { Swal.fire('Error', error.message, 'error'); return false; }
        
        // Recalculate shares if budget changed and activity is active
        if (status === 'active' && parseFloat(budget) !== oldActivity?.totalBudget) {
            const members = await getFamilyMembers();
            const payingMembers = members.filter(m => m.member_type === 'board' || m.member_type === 'parent');
            const amountPerPayer = parseFloat(budget) / payingMembers.length;
            
            for (const payer of payingMembers) {
                const dependents = members.filter(m => {
                    const responsible = getPaymentResponsibleMember(m);
                    return responsible && responsible.id === payer.id;
                });
                const sharePerDependent = dependents.length > 0 ? amountPerPayer / dependents.length : amountPerPayer;
                
                for (const dependent of dependents) {
                    await _supabase
                        .from('member_activities')
                        .update({ amount_owed: sharePerDependent })
                        .eq('activity_id', id)
                        .eq('member_id', dependent.id);
                }
            }
        }
    }
    
    await loadData();
    await renderCurrentPage();
    Swal.fire('Updated!', 'Activity updated successfully', 'success');
    return true;
}

// ============================================
// ADD COMPLETE BUTTON TO ACTIVITY CARDS
// ============================================
// Update renderAdminActivities to include Complete button
async function renderAdminActivities() {
    const acts = await getActivities();
    document.getElementById('pageContent').innerHTML = `
        <div class="card">
            <h2>All Activities <button class="btn-primary" onclick="openAddModal()"><i class="fas fa-plus"></i> New Activity</button></h2>
            <div class="activity-grid">
                ${acts.map(a => {
                    const collected = a.memberPayments?.reduce((sum, mp) => sum + (mp.amount_paid || 0), 0) || 0;
                    const progress = a.totalBudget > 0 ? (collected / a.totalBudget * 100).toFixed(0) : 0;
                    const paidCount = a.memberPayments?.filter(mp => mp.status === 'paid').length || 0;
                    const totalMembers = a.memberPayments?.length || 0;
                    const isCompleted = a.status === 'completed';
                    
                    return `
                        <div class="activity-card" style="${isCompleted ? 'opacity: 0.8; background: linear-gradient(135deg, #e8f5e9, #c8e6c9);' : ''}">
                            <h3>${a.name} ${isCompleted ? '✅ COMPLETED' : ''}</h3>
                            <p>${a.description || 'No description'}</p>
                            <p><strong>💰 Budget:</strong> UGX ${(a.totalBudget || 0).toLocaleString()}</p>
                            <p><strong>👥 Paid:</strong> ${paidCount}/${totalMembers} members</p>
                            <p><strong>📅 Due:</strong> ${new Date(a.expectedCompletionDate).toLocaleDateString()}</p>
                            <div class="progress-bar-container"><div class="progress-bar" style="width:${progress}%">${progress}%</div></div>
                            <span class="badge badge-${a.status}">${a.status}</span>
                            <div style="margin-top: 10px;">
                                <button class="btn-edit" onclick="openEditActivity(${a.id})">Edit</button>
                                <button class="btn-danger" onclick="deleteActivity(${a.id})">Delete</button>
                                <button class="btn-primary" onclick="showActivityDetails(${a.id})">Details</button>
                                ${!isCompleted ? `<button class="btn-whatsapp" onclick="manuallyCompleteActivity(${a.id})" style="background: var(--warning);">Complete & Waive</button>` : ''}
                            </div>
                        </div>
                    `;
                }).join('') || '<p style="text-align:center; padding: 40px;">No activities created yet.</p>'}
            </div>
        </div>
    `;
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
    const payingMembers = members.filter(m => m.member_type === 'board' || m.member_type === 'parent');
    const stats = await getStatistics();
    
    let message = `📊 *OBUNANGWE BULAIIRE - COMPLETE REPORT* 📊\n\n`;
    message += `📅 ${new Date().toLocaleString()}\n`;
    message += `👥 Total Members: ${members.length}\n`;
    message += `💰 Paying Members: ${payingMembers.length}\n`;
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
        const responsible = getPaymentResponsibleMember(m);
        message += `👤 *${m.name}* (${m.member_type === 'board' ? 'Board Member' : (m.member_type === 'parent' ? 'Parent' : (m.member_type === 'child' ? 'Child' : 'Dependent'))})\n`;
        if (responsible && responsible.id !== m.id) {
            message += `   👨‍👩 Pays: ${responsible.name}\n`;
        }
        message += `   💰 Owed: UGX ${s.totalOwed.toLocaleString()}\n   ✅ Paid: UGX ${s.totalPaid.toLocaleString()}\n   ⚖️ Balance: UGX ${s.balance.toLocaleString()}\n   Status: ${s.balance === 0 ? '✅ SETTLED' : s.balance > 0 ? '⚠️ PENDING' : '✅ OVERPAID'}\n\n`;
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
    
    let html = `
        <div style="margin-bottom: 15px;">
            <h3>${activity.name}</h3>
            <p>${activity.description || 'No description'}</p>
            <p><strong>💰 Budget:</strong> UGX ${(activity.totalBudget || 0).toLocaleString()}</p>
            <p><strong>📅 Due:</strong> ${new Date(activity.expectedCompletionDate).toLocaleDateString()}</p>
            <p><strong>Status:</strong> <span class="badge badge-${activity.status}">${activity.status}</span></p>
        </div>
        <h4 style="margin-top: 10px;">Member Payments</h4>
        <div style="overflow-x: auto;">
            <table class="data-table" style="width: 100%;">
                <thead>
                    <tr>
                        <th>Member</th><th>Type</th><th>Owed (UGX)</th><th>Paid (UGX)</th><th>Balance (UGX)</th><th>Status</th><th>Action</th>
                    </tr>
                </thead>
                <tbody>`;
    
    for (const mp of activity.memberPayments || []) {
        const balance = mp.amount_owed - mp.amount_paid;
        const member = mp.family_members;
        const hasAdjustment = mp.adjustment_amount && mp.adjustment_amount > 0;
        const rowClass = hasAdjustment ? 'adjustment-row' : '';
        
        html += `<tr class="${rowClass}" onclick="showMemberDetails(${mp.member_id})" style="cursor:pointer">
            <td><strong>${member?.name || 'Unknown'}</strong>${hasAdjustment ? '<span class="adjustment-badge"> Adjusted</span>' : ''}</td>
            <td><span class="member-type-badge member-type-${member?.member_type || 'child'}">${member?.member_type === 'board' ? 'Board' : (member?.member_type === 'parent' ? 'Parent' : (member?.member_type === 'child' ? 'Child' : 'Dependent'))}</span></td>
            <td>UGX ${mp.amount_owed.toLocaleString()}</td>
            <td style="color: var(--success);">UGX ${mp.amount_paid.toLocaleString()}</td>
            <td class="${balance === 0 ? 'balance-zero' : 'balance-positive'}">UGX ${balance.toLocaleString()}</td>
            <td>${mp.status === 'paid' ? '✅ Paid' : mp.status === 'partial' ? '⚠️ Partial' : '❌ Unpaid'}</td>
            <td onclick="event.stopPropagation()">
                <button class="btn-adjust" onclick="openAdjustmentModal(${activity.id}, ${mp.member_id})">
                    <i class="fas fa-sliders-h"></i> Adjust
                </button>
            </td>
        </tr>`;
    }
    html += `</tbody></table></div>`;
    
    document.getElementById('activityDetailsContent').innerHTML = html;
    document.getElementById('activityDetailsModal').style.display = 'flex';
}

async function showMemberDetails(memberId) {
    const member = _familyMembers.find(m => m.id === memberId);
    if (!member) return;
    
    const medicalInfo = [];
    if (member.blood_group) medicalInfo.push(`Blood: ${member.blood_group}`);
    if (member.allergies) medicalInfo.push(`Allergies: ${member.allergies}`);
    
    const responsible = getPaymentResponsibleMember(member);
    const stats = await getUserStatistics(member.id);
    
    // Use profile_picture_url (not profile_picture)
    const pictureUrl = member.profile_picture_url;
    
    const html = `
        <div class="member-profile-card">
            <div class="member-profile-header">
                <div class="member-profile-picture">
                    ${pictureUrl ? 
                        `<img src="${pictureUrl}" alt="${member.name}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">` : 
                        `<i class="fas fa-user-circle" style="font-size: 50px; color: white;"></i>`
                    }
                </div>
                <div class="member-profile-name">${member.name}</div>
                <div class="member-profile-role">
                    <span class="member-type-badge member-type-${member.member_type}">
                        ${member.member_type === 'board' ? '🏛️ Board Member' : (member.member_type === 'parent' ? '👨‍👩 Parent' : (member.member_type === 'child' ? '🧒 Child' : '👶 Dependent'))}
                    </span>
                    ${member.board_position ? `<span style="margin-left:5px">(${member.board_position})</span>` : ''}
                </div>
            </div>
            <div class="member-profile-body">
                <div class="member-info-group">
                    <h4><i class="fas fa-chart-line"></i> Payment Summary</h4>
                    <div class="member-info-row"><span class="member-info-label">💰 Total Owed:</span><span class="member-info-value">UGX ${(stats.totalOwed || 0).toLocaleString()}</span></div>
                    <div class="member-info-row"><span class="member-info-label">✅ Total Paid:</span><span class="member-info-value" style="color:var(--success)">UGX ${(stats.totalPaid || 0).toLocaleString()}</span></div>
                    <div class="member-info-row"><span class="member-info-label">⚖️ Balance:</span><span class="member-info-value ${stats.balance === 0 ? 'balance-zero' : 'balance-positive'}">UGX ${(stats.balance || 0).toLocaleString()}</span></div>
                </div>
                
                <div class="member-info-group">
                    <h4><i class="fas fa-address-card"></i> Personal Information</h4>
                    ${member.date_of_birth ? `<div class="member-info-row"><span class="member-info-label">🎂 Birthday:</span><span class="member-info-value">${new Date(member.date_of_birth).toLocaleDateString()}</span></div>` : ''}
                    ${member.occupation ? `<div class="member-info-row"><span class="member-info-label">💼 Occupation:</span><span class="member-info-value">${member.occupation}</span></div>` : ''}
                    ${member.location ? `<div class="member-info-row"><span class="member-info-label">📍 Location:</span><span class="member-info-value">${member.location}</span></div>` : ''}
                    ${member.marital_status ? `<div class="member-info-row"><span class="member-info-label">💍 Status:</span><span class="member-info-value">${member.marital_status}</span></div>` : ''}
                    ${member.anniversary_date ? `<div class="member-info-row"><span class="member-info-label">💕 Anniversary:</span><span class="member-info-value">${new Date(member.anniversary_date).toLocaleDateString()}</span></div>` : ''}
                    ${member.favorite_color ? `<div class="member-info-row"><span class="member-info-label">🎨 Favorite Color:</span><span class="member-info-value"><span class="favorite-color-dot" style="background: ${member.favorite_color}"></span> ${member.favorite_color}</span></div>` : ''}
                </div>
                
                ${medicalInfo.length > 0 ? `<div class="member-info-group"><h4><i class="fas fa-notes-medical"></i> Medical Information</h4><div class="member-info-value">${medicalInfo.map(info => `<span class="medical-badge">${info}</span>`).join('')}</div></div>` : ''}
                
                ${member.emergency_contact ? `<div class="member-info-group"><h4><i class="fas fa-phone-alt"></i> Emergency Contact</h4><div class="member-info-value">${member.emergency_contact}</div></div>` : ''}
                
                ${responsible && responsible.id !== member.id ? `<div class="member-info-group"><h4><i class="fas fa-money-bill-wave"></i> Payment Responsibility</h4><div class="member-info-value">Payments handled by: <strong>${responsible.name}</strong> (${responsible.member_type === 'board' ? 'Board Member' : 'Parent'})</div></div>` : ''}
                
                ${member.bio ? `<div class="member-info-group"><h4><i class="fas fa-heart"></i> About</h4><div class="member-info-value">${member.bio}</div></div>` : ''}
                
                <div class="member-info-group">
                    <h4><i class="fas fa-address-book"></i> Contact</h4>
                    ${member.phone ? `<div class="member-info-row"><span class="member-info-label">📱 Phone:</span><span class="member-info-value">${member.phone}</span></div>` : ''}
                    ${member.email ? `<div class="member-info-row"><span class="member-info-label">📧 Email:</span><span class="member-info-value">${member.email}</span></div>` : ''}
                </div>
            </div>
        </div>
    `;
    
    document.getElementById('memberDetailsContent').innerHTML = html;
    document.getElementById('memberDetailsModal').style.display = 'flex';
}

// ============================================
// BIRTHDAY CHECK FUNCTION
// ============================================
function checkBirthdays() {
    const today = new Date();
    _familyMembers.forEach(member => {
        if (member.date_of_birth) {
            const birthDate = new Date(member.date_of_birth);
            if (birthDate.getMonth() === today.getMonth() && birthDate.getDate() === today.getDate()) {
                addNotification('🎂 Birthday Today!', `Today is ${member.name}'s birthday! Send them your best wishes!`, 'success', member.id);
            }
        }
        if (member.anniversary_date) {
            const anniDate = new Date(member.anniversary_date);
            if (anniDate.getMonth() === today.getMonth() && anniDate.getDate() === today.getDate()) {
                addNotification('💕 Anniversary!', `${member.name} is celebrating their anniversary today!`, 'success', member.id);
            }
        }
    });
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
                addNotification('📢 New Activity!', `"${payload.new.name}" has been added. Check your share amount.`, 'info', payload.new.id);
            }
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'activities' }, (payload) => {
            if (payload.new.status === 'completed' && payload.old.status !== 'completed') {
                addNotification('🎉 Activity Completed!', `"${payload.new.name}" is now complete. Thank you!`, 'success', payload.new.id);
            }
        })
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'payments' }, async (payload) => {
            const { data: paymentData } = await _supabase.from('payments').select('*, family_members(name), activities(name)').eq('id', payload.new.id).single();
            if (paymentData && _currentRole === 'user' && _currentUser?.id === paymentData.member_id) {
                addNotification('✅ Payment Received!', `UGX ${paymentData.amount.toLocaleString()} recorded for "${paymentData.activities.name}"`, 'success', paymentData.id);
            } else if (paymentData && _currentRole === 'admin') {
                addNotification('💰 Payment Recorded', `${paymentData.family_members?.name} paid UGX ${paymentData.amount.toLocaleString()}`, 'info', paymentData.id);
            }
        })
        .subscribe();
}

// ============================================
// RENDER FUNCTIONS - PROFESSIONAL TABLES
// ============================================

// Render Members with Professional Table
async function renderAdminMembers() {
    const members = await getFamilyMembers();
    const memberStats = [];
    for (const m of members) {
        const stats = await getUserStatistics(m.id);
        memberStats.push({ ...m, stats });
    }
    
    const boardMembers = members.filter(m => m.member_type === 'board');
    const parents = members.filter(m => m.member_type === 'parent');
    const children = members.filter(m => m.member_type === 'child');
    const dependents = members.filter(m => m.member_type === 'dependent');
    
    document.getElementById('pageContent').innerHTML = `
        <div class="card">
            <h2>🏛️ Board Members / Family Heads 
                <button class="btn-primary" onclick="openAddModal()"><i class="fas fa-plus"></i> Add Member</button>
            </h2>
            ${renderMemberTable(boardMembers, memberStats, 'Board Members')}
        </div>
        
        <div class="card">
            <h2>👨‍👩 Parents / Guardians</h2>
            ${renderMemberTable(parents, memberStats, 'Parents')}
        </div>
        
        <div class="card">
            <h2>🧒 Children (Self-Paying)</h2>
            ${renderMemberTable(children, memberStats, 'Children')}
        </div>
        
        <div class="card">
            <h2>👶 Dependents (Non-Paying - Parents Pay)</h2>
            ${renderMemberTable(dependents, memberStats, 'Dependents')}
        </div>
    `;
}

// Update renderMemberTable function to show board position
function renderMemberTable(members, memberStats, title) {
    if (members.length === 0) {
        return `<div style="text-align:center; padding: 30px; color: #999; background: var(--gray-100); border-radius: 12px;">
            <i class="fas fa-users" style="font-size: 32px; margin-bottom: 10px; display: block;"></i>
            No ${title.toLowerCase()} found
        </div>`;
    }
    
    return `
        <div class="members-table-container">
            <table class="members-table">
                <thead>
                    <tr>
                        <th>Photo</th>
                        <th>Name</th>
                        <th>Position/Role</th>
                        <th>Contact</th>
                        <th>Medical</th>
                        <th>Location</th>
                        <th>Owed (UGX)</th>
                        <th>Paid (UGX)</th>
                        <th>Balance (UGX)</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${members.map(m => {
                        const stats = memberStats.find(s => s.id === m.id)?.stats || { totalOwed: 0, totalPaid: 0, balance: 0 };
                        const balanceClass = stats.balance === 0 ? 'balance-zero' : (stats.balance > 0 ? 'balance-positive' : 'balance-negative');
                        const responsible = getPaymentResponsibleMember(m);
                        const isPayingForOthers = members.some(other => {
                            const otherResponsible = getPaymentResponsibleMember(other);
                            return otherResponsible && otherResponsible.id === m.id && other.id !== m.id;
                        });
                        
                        // Format position/role with board position if applicable
                        let positionHtml = '';
                        if (m.member_type === 'board') {
                            positionHtml = `
                                <span class="member-type-badge member-type-board">
                                    <i class="fas fa-crown board-crown"></i> Board Member
                                </span>
                                ${m.board_position ? `<div class="board-position-cell"><i class="fas fa-briefcase"></i> ${m.board_position.charAt(0).toUpperCase() + m.board_position.slice(1)}</div>` : ''}
                            `;
                        } else {
                            positionHtml = `
                                <span class="member-type-badge member-type-${m.member_type}">
                                    ${m.member_type === 'parent' ? '👨‍👩 Parent' : (m.member_type === 'child' ? '🧒 Child' : '👶 Dependent')}
                                </span>
                            `;
                        }
                        
                        return `
                            <tr onclick="showMemberDetails(${m.id})">
                                <td>${m.profile_picture ? `<img src="${m.profile_picture}" class="member-avatar-table">` : `<div class="member-avatar-placeholder"><i class="fas ${m.member_type === 'board' ? 'fa-crown' : (m.member_type === 'parent' ? 'fa-user-tie' : 'fa-user-child')}"></i></div>`}${m.member_type === 'board' ? '<div style="font-size: 10px; text-align: center; margin-top: 4px;">👑 Board</div>' : ''}</td>
                                <td class="member-name-cell">${m.name} ${isPayingForOthers ? '<span class="approval-badge">Pays for others</span>' : ''}${m.member_type === 'board' ? '<span class="board-position-badge">Board</span>' : ''}</div></td>
                                <td>${positionHtml}</div>${responsible && responsible.id !== m.id ? `<div class="payment-responsible"><i class="fas fa-user-check"></i> Pays: ${responsible.name}</div>` : ''}</div></td>
                                <td><div class="contact-icons" onclick="event.stopPropagation()">${m.phone ? `<button class="contact-icon-btn whatsapp" onclick="sendWhatsApp('${m.phone}', 'Hello ${m.name} from OBUNANGWE BULAIIRE!')" title="WhatsApp"><i class="fab fa-whatsapp"></i></button><button class="contact-icon-btn call" onclick="makeCall('${m.phone}')" title="Call"><i class="fas fa-phone"></i></button>` : '<span class="member-tooltip">—</span>'}</div></div></td>
                                <td>${m.blood_group ? `<span class="medical-badge-table"><i class="fas fa-tint"></i> ${m.blood_group}</span>` : ''}${m.allergies ? `<span class="medical-badge-table"><i class="fas fa-allergies"></i> Allergy</span>` : ''}${!m.blood_group && !m.allergies ? '—' : ''}</div></td>
                                <td>${m.location ? `<i class="fas fa-map-marker-alt"></i> ${m.location}` : '—'}</div></td>
                                <td class="balance-positive">UGX ${(stats.totalOwed || 0).toLocaleString()}</div></td>
                                <td style="color: var(--success); font-weight: 600;">UGX ${(stats.totalPaid || 0).toLocaleString()}</div></td>
                                <td class="${balanceClass}">UGX ${(stats.balance || 0).toLocaleString()}</div></td>
                                <td><div class="action-buttons" onclick="event.stopPropagation()"><button class="contact-icon-btn edit" onclick="openEditMember(${m.id})" title="Edit"><i class="fas fa-edit"></i></button><button class="contact-icon-btn delete" onclick="deleteMember(${m.id})" title="Delete"><i class="fas fa-trash"></i></button></div></div></td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        </div>
    `;
}

// Payment Summary Module
async function renderPaymentSummary() {
    const members = await getFamilyMembers();
    const payingMembers = members.filter(m => m.member_type === 'board' || m.member_type === 'parent');
    const memberStats = [];
    for (const m of members) {
        const stats = await getUserStatistics(m.id);
        memberStats.push({ ...m, stats });
    }
    
    // Calculate totals
    let totalOwedAll = 0, totalPaidAll = 0;
    memberStats.forEach(m => {
        totalOwedAll += m.stats.totalOwed || 0;
        totalPaidAll += m.stats.totalPaid || 0;
    });
    const totalBalanceAll = totalOwedAll - totalPaidAll;
    const completionRate = totalOwedAll > 0 ? (totalPaidAll / totalOwedAll * 100).toFixed(1) : 100;
    
    // Group by payment responsibility
    const paymentGroups = new Map();
    for (const member of members) {
        const responsible = getPaymentResponsibleMember(member);
        if (!paymentGroups.has(responsible.id)) {
            paymentGroups.set(responsible.id, {
                payer: responsible,
                members: []
            });
        }
        paymentGroups.get(responsible.id).members.push(member);
    }
    
    document.getElementById('pageContent').innerHTML = `
        <div class="stats-grid">
            <div class="stat-card"><div class="stat-number">UGX ${totalOwedAll.toLocaleString()}</div><h3>Total Owed</h3></div>
            <div class="stat-card"><div class="stat-number">UGX ${totalPaidAll.toLocaleString()}</div><h3>Total Paid</h3></div>
            <div class="stat-card"><div class="stat-number">UGX ${totalBalanceAll.toLocaleString()}</div><h3>Total Balance</h3></div>
            <div class="stat-card"><div class="stat-number">${completionRate}%</div><h3>Completion Rate</h3></div>
        </div>
        
        <div class="card">
            <h2>💰 Payment Summary by Responsible Person</h2>
            <div class="members-table-container">
                <table class="members-table">
                    <thead>
                        <tr>
                            <th>Payer</th>
                            <th>Type</th>
                            <th>Pays For</th>
                            <th>Total Owed (UGX)</th>
                            <th>Total Paid (UGX)</th>
                            <th>Balance (UGX)</th>
                            <th>Status</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${Array.from(paymentGroups.values()).map(group => {
                            const payerStats = memberStats.find(s => s.id === group.payer.id)?.stats || { totalOwed: 0, totalPaid: 0, balance: 0 };
                            const dependentNames = group.members.filter(m => m.id !== group.payer.id).map(m => m.name).join(', ');
                            const balanceClass = payerStats.balance === 0 ? 'balance-zero' : (payerStats.balance > 0 ? 'balance-positive' : 'balance-negative');
                            const statusText = payerStats.balance === 0 ? '✅ Settled' : (payerStats.balance > 0 ? '⚠️ Pending' : '✅ Overpaid');
                            
                            return `
                                <tr onclick="showMemberDetails(${group.payer.id})" style="cursor:pointer">
                                    <td class="member-name-cell">${group.payer.name}</td>
                                    <td><span class="member-type-badge member-type-${group.payer.member_type}">${group.payer.member_type === 'board' ? 'Board Member' : 'Parent'}</span></td>
                                    <td>${dependentNames || 'Self only'}</td>
                                    <td class="balance-positive">UGX ${(payerStats.totalOwed || 0).toLocaleString()}</td>
                                    <td style="color: var(--success); font-weight: 600;">UGX ${(payerStats.totalPaid || 0).toLocaleString()}</td>
                                    <td class="${balanceClass}">UGX ${(payerStats.balance || 0).toLocaleString()}</td>
                                    <td class="${payerStats.balance === 0 ? 'status-settled' : 'status-pending'}">${statusText}</td>
                                    <td onclick="event.stopPropagation()">${group.payer.phone && payerStats.balance > 0 ? `<button class="contact-icon-btn whatsapp" onclick="sendWhatsApp('${group.payer.phone}', 'Reminder: You have UGX ${(payerStats.balance || 0).toLocaleString()} pending on OBUNANGWE BULAIIRE')"><i class="fab fa-whatsapp"></i> Remind</button>` : '—'}</td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        </div>
        
        <div class="card">
            <h2>📋 Detailed Member Payment Status</h2>
            <div class="members-table-container">
                <table class="members-table">
                    <thead>
                        <tr>
                            <th>Member</th>
                            <th>Type</th>
                            <th>Payer</th>
                            <th>Total Owed (UGX)</th>
                            <th>Total Paid (UGX)</th>
                            <th>Balance (UGX)</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${memberStats.map(m => {
                            const responsible = getPaymentResponsibleMember(m);
                            const balanceClass = m.stats.balance === 0 ? 'balance-zero' : (m.stats.balance > 0 ? 'balance-positive' : 'balance-negative');
                            const statusText = m.stats.balance === 0 ? '✅ Settled' : (m.stats.balance > 0 ? '⚠️ Pending' : '✅ Overpaid');
                            
                            return `
                                <tr onclick="showMemberDetails(${m.id})" style="cursor:pointer">
                                    <td class="member-name-cell">${m.name}</td>
                                    <td><span class="member-type-badge member-type-${m.member_type}">${m.member_type === 'board' ? 'Board' : (m.member_type === 'parent' ? 'Parent' : (m.member_type === 'child' ? 'Child' : 'Dependent'))}</span></td>
                                    <td>${responsible && responsible.id !== m.id ? responsible.name : '<span class="payment-responsible">Self</span>'}</td>
                                    <td class="balance-positive">UGX ${(m.stats.totalOwed || 0).toLocaleString()}</td>
                                    <td style="color: var(--success); font-weight: 600;">UGX ${(m.stats.totalPaid || 0).toLocaleString()}</td>
                                    <td class="${balanceClass}">UGX ${(m.stats.balance || 0).toLocaleString()}</td>
                                    <td class="${m.stats.balance === 0 ? 'status-settled' : 'status-pending'}">${statusText}</td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

// Admin Dashboard
async function renderAdminDashboard() {
    const stats = await getStatistics();
    const acts = await getActivities();
    const members = await getFamilyMembers();
    const payingMembers = members.filter(m => m.member_type === 'board' || m.member_type === 'parent');
    
    document.getElementById('pageContent').innerHTML = `
        <div class="stats-grid">
            <div class="stat-card" onclick="switchPage('activities')"><div class="stat-number">${stats.activeActivities}</div><h3>Active Activities</h3></div>
            <div class="stat-card" onclick="switchPage('activities')"><div class="stat-number">${stats.completedActivities}</div><h3>Completed</h3></div>
            <div class="stat-card" onclick="switchPage('payments')"><div class="stat-number">UGX ${(stats.totalCollected || 0).toLocaleString()}</div><h3>Total Collected</h3></div>
            <div class="stat-card" onclick="switchPage('reports')"><div class="stat-number">UGX ${((stats.totalOwed || 0) - (stats.totalCollected || 0)).toLocaleString()}</div><h3>Pending</h3></div>
        </div>
        
        <div class="stats-grid" style="margin-top: 0;">
            <div class="stat-card"><div class="stat-number">${payingMembers.length}</div><h3>Paying Members</h3></div>
            <div class="stat-card"><div class="stat-number">${members.length - payingMembers.length}</div><h3>Non-Paying</h3></div>
        </div>
        
        <div class="card">
            <h2>Recent Activities 
                <button class="btn-whatsapp" onclick="generateShareableReport()">
                    <i class="fab fa-whatsapp"></i> Share Report
                </button>
            </h2>
            <div class="members-table-container">
                <table class="data-table" style="width: 100%;">
                    <thead>
                        <tr><th>Activity</th><th>Budget (UGX)</th><th>Due Date</th><th>Progress</th><th>Status</th><th>Action</th></tr>
                    </thead>
                    <tbody>
                        ${acts.slice(0,5).map(a => {
                            const collected = a.memberPayments?.reduce((sum, mp) => sum + (mp.amount_paid || 0), 0) || 0;
                            const progress = a.totalBudget > 0 ? (collected / a.totalBudget * 100).toFixed(0) : 0;
                            return `
                                <tr>
                                    <td><strong>${a.name}</strong>${a.status === 'completed' ? ' ✅' : ''}</td>
                                    <td>UGX ${(a.totalBudget || 0).toLocaleString()}</td>
                                    <td>${a.expectedCompletionDate ? new Date(a.expectedCompletionDate).toLocaleDateString() : 'No date'}</td>
                                    <td><div class="progress-bar-container"><div class="progress-bar" style="width:${progress}%">${progress}%</div></div></td>
                                    <td><span class="badge badge-${a.status}">${a.status}</span></td>
                                    <td><button class="btn-edit" onclick="showActivityDetails(${a.id})">View</button></td>
                                </tr>
                            `;
                        }).join('') || '<tr><td colspan="6" style="text-align:center;">No activities</td></tr>'}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

// Admin Activities
async function renderAdminActivities() {
    const acts = await getActivities();
    document.getElementById('pageContent').innerHTML = `
        <div class="card">
            <h2>All Activities <button class="btn-primary" onclick="openAddModal()"><i class="fas fa-plus"></i> New Activity</button></h2>
            <div class="activity-grid">
                ${acts.map(a => {
                    const collected = a.memberPayments?.reduce((sum, mp) => sum + (mp.amount_paid || 0), 0) || 0;
                    const progress = a.totalBudget > 0 ? (collected / a.totalBudget * 100).toFixed(0) : 0;
                    const paidCount = a.memberPayments?.filter(mp => mp.status === 'paid').length || 0;
                    const totalMembers = a.memberPayments?.length || 0;
                    return `
                        <div class="activity-card">
                            <h3>${a.name} ${a.status === 'completed' ? '✅' : ''}</h3>
                            <p>${a.description || 'No description'}</p>
                            <p><strong>💰 Budget:</strong> UGX ${(a.totalBudget || 0).toLocaleString()}</p>
                            <p><strong>👥 Paid:</strong> ${paidCount}/${totalMembers} members</p>
                            <p><strong>📅 Due:</strong> ${new Date(a.expectedCompletionDate).toLocaleDateString()}</p>
                            <div class="progress-bar-container"><div class="progress-bar" style="width:${progress}%">${progress}%</div></div>
                            <span class="badge badge-${a.status}">${a.status}</span>
                            <div style="margin-top: 10px;">
                                <button class="btn-edit" onclick="openEditActivity(${a.id})">Edit</button>
                                <button class="btn-danger" onclick="deleteActivity(${a.id})">Delete</button>
                                <button class="btn-primary" onclick="showActivityDetails(${a.id})">Details</button>
                            </div>
                        </div>
                    `;
                }).join('') || '<p style="text-align:center; padding: 40px;">No activities created yet.</p>'}
            </div>
        </div>
    `;
}

// Admin Payments
async function renderAdminPayments() {
    // Show loading state immediately
    document.getElementById('pageContent').innerHTML = `
        <div class="card">
            <h2>All Payments <button class="btn-primary" onclick="openAddModal()"><i class="fas fa-plus"></i> Record Payment</button></h2>
            <div style="text-align: center; padding: 40px;">
                <i class="fas fa-spinner fa-pulse fa-2x"></i>
                <p>Loading payments...</p>
            </div>
        </div>
    `;
    
    // Fetch payments
    const payments = await getAllPayments();
    
    if (payments.length === 0) {
        document.getElementById('pageContent').innerHTML = `
            <div class="card">
                <h2>All Payments <button class="btn-primary" onclick="openAddModal()"><i class="fas fa-plus"></i> Record Payment</button></h2>
                <div style="text-align: center; padding: 40px;">
                    <i class="fas fa-receipt" style="font-size: 48px; color: #ccc; margin-bottom: 16px; display: block;"></i>
                    <p>No payments recorded yet.</p>
                    <button class="btn-primary" onclick="openAddModal()" style="margin-top: 16px;">Record First Payment</button>
                </div>
            </div>
        `;
        return;
    }
    
    // Display payments
    document.getElementById('pageContent').innerHTML = `
        <div class="card">
            <h2>All Payments <button class="btn-primary" onclick="openAddModal()"><i class="fas fa-plus"></i> Record Payment</button></h2>
            <div style="overflow-x: auto;">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Member</th>
                            <th>Activity</th>
                            <th>Amount (UGX)</th>
                            <th>Notes</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${payments.slice(0, 50).map(p => `  <!-- Limit to 50 most recent -->
                            <tr>
                                <td>${new Date(p.payment_date).toLocaleDateString()}</div>
                                <td><strong>${p.memberName}</strong></div>
                                <td>${p.activityName}</div>
                                <td style="color: #27ae60; font-weight: bold;">UGX ${(p.amount || 0).toLocaleString()}</div>
                                <td>${p.notes || '-'}</div>
                                <td><button class="btn-delete-payment" onclick="deletePayment(${p.id})"><i class="fas fa-trash-alt"></i> Delete</button></div>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
            ${payments.length > 50 ? `<p style="text-align: center; margin-top: 15px; font-size: 12px; color: #666;">Showing last 50 of ${payments.length} payments</p>` : ''}
        </div>
    `;
}

// User Payments
async function renderUserPayments() {
    // Show loading state
    document.getElementById('pageContent').innerHTML = `
        <div class="card">
            <h2>My Payment History</h2>
            <div style="text-align: center; padding: 40px;">
                <i class="fas fa-spinner fa-pulse fa-2x"></i>
                <p>Loading payment history...</p>
            </div>
        </div>
    `;
    
    const payments = await getMemberPayments(_currentUser.id);
    
    if (payments.length === 0) {
        document.getElementById('pageContent').innerHTML = `
            <div class="card">
                <h2>My Payment History</h2>
                <div style="text-align: center; padding: 40px;">
                    <i class="fas fa-receipt" style="font-size: 48px; color: #ccc; margin-bottom: 16px; display: block;"></i>
                    <p>No payment history found.</p>
                </div>
            </div>
        `;
        return;
    }
    
    document.getElementById('pageContent').innerHTML = `
        <div class="card">
            <h2>My Payment History</h2>
            <div style="overflow-x: auto;">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Activity</th>
                            <th>Amount (UGX)</th>
                            <th>Notes</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${payments.map(p => `
                            <tr>
                                <td>${new Date(p.payment_date).toLocaleDateString()}</div>
                                <td>${p.activityName}</div>
                                <td style="color: #27ae60; font-weight: bold;">UGX ${(p.amount || 0).toLocaleString()}</div>
                                <td>${p.notes || '-'}</div>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

let currentPaymentPage = 1;
const PAYMENTS_PER_PAGE = 20;

async function renderAdminPaymentsPaginated(page = 1) {
    currentPaymentPage = page;
    const start = (page - 1) * PAYMENTS_PER_PAGE;
    const end = start + PAYMENTS_PER_PAGE;
    
    document.getElementById('pageContent').innerHTML = `
        <div class="card">
            <h2>All Payments <button class="btn-primary" onclick="openAddModal()"><i class="fas fa-plus"></i> Record Payment</button></h2>
            <div style="text-align: center; padding: 20px;">
                <i class="fas fa-spinner fa-pulse"></i> Loading payments...
            </div>
        </div>
    `;
    
    const { data: payments, error, count } = await _supabase
        .from('payments')
        .select(`
            *,
            family_members(name),
            activities(name)
        `, { count: 'exact' })
        .order('payment_date', { ascending: false })
        .range(start, end - 1);
    
    if (error) {
        console.error('Error fetching payments:', error);
        return;
    }
    
    const formattedPayments = payments.map(p => ({
        ...p,
        memberName: p.family_members?.name || 'Unknown',
        activityName: p.activities?.name || 'Unknown'
    }));
    
    const totalPages = Math.ceil(count / PAYMENTS_PER_PAGE);
    
    document.getElementById('pageContent').innerHTML = `
        <div class="card">
            <h2>All Payments <button class="btn-primary" onclick="openAddModal()"><i class="fas fa-plus"></i> Record Payment</button></h2>
            ${formattedPayments.length === 0 ? `
                <div style="text-align: center; padding: 40px;">
                    <i class="fas fa-receipt" style="font-size: 48px; color: #ccc; margin-bottom: 16px; display: block;"></i>
                    <p>No payments recorded yet.</p>
                </div>
            ` : `
                <div style="overflow-x: auto;">
                    <table class="data-table">
                        <thead>
                            <tr><th>Date</th><th>Member</th><th>Activity</th><th>Amount (UGX)</th><th>Notes</th><th>Action</th></tr>
                        </thead>
                        <tbody>
                            ${formattedPayments.map(p => `
                                <tr>
                                    <td>${new Date(p.payment_date).toLocaleDateString()}</div>
                                    <td><strong>${p.memberName}</strong></div>
                                    <td>${p.activityName}</div>
                                    <td style="color: #27ae60; font-weight: bold;">UGX ${(p.amount || 0).toLocaleString()}</div>
                                    <td>${p.notes || '-'}</div>
                                    <td><button class="btn-delete-payment" onclick="deletePayment(${p.id})"><i class="fas fa-trash-alt"></i> Delete</button></div>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
                ${totalPages > 1 ? `
                    <div style="display: flex; justify-content: center; gap: 10px; margin-top: 20px;">
                        <button class="btn-primary" onclick="renderAdminPaymentsPaginated(${page - 1})" ${page === 1 ? 'disabled' : ''}>&laquo; Previous</button>
                        <span style="padding: 8px 16px;">Page ${page} of ${totalPages}</span>
                        <button class="btn-primary" onclick="renderAdminPaymentsPaginated(${page + 1})" ${page === totalPages ? 'disabled' : ''}>Next &raquo;</button>
                    </div>
                ` : ''}
            `}
        </div>
    `;
}

// Contacts
async function renderContacts() {
    const members = await getFamilyMembers();
    
    if (members.length === 0) {
        document.getElementById('pageContent').innerHTML = `
            <div class="card">
                <h2><i class="fas fa-address-book"></i> Contacts</h2>
                <div style="text-align:center;padding:30px">
                    <i class="fas fa-users" style="font-size:40px;color:var(--gray-400);margin-bottom:12px;display:block;"></i>
                    <p style="font-size:13px;">No contacts yet. Add family members.</p>
                    ${_currentRole === 'admin' ? '<button class="btn-primary" onclick="switchPage(\'members\')" style="margin-top:12px;padding:6px 12px;font-size:12px;">Add Members →</button>' : ''}
                </div>
            </div>
        `;
        return;
    }
    
    // For regular users - Compact Card Layout (SHOWS BOARD POSITION)
    if (_currentRole === 'user') {
        document.getElementById('pageContent').innerHTML = `
            <div class="card" style="padding: 12px;">
                <h2 style="font-size: 16px; margin-bottom: 10px;"><i class="fas fa-address-book"></i> Family Contacts</h2>
                <div class="contact-card-list">
                    ${members.map(m => {
                        // DEBUG: Log to see if board_position exists
                        console.log('Member:', m.name, 'Type:', m.member_type, 'Position:', m.board_position);
                        
                        // Determine display for board members with position
                        let roleDisplay = '';
                        if (m.member_type === 'board') {
                            // Get the position value - handle different possible field names
                            let position = m.board_position || m.position || '';
                            let positionDisplay = '';
                            
                            if (position && position !== '') {
                                // Format the position nicely
                                let formattedPosition = position.charAt(0).toUpperCase() + position.slice(1).replace('_', ' ');
                                positionDisplay = `
                                    <span class="board-position-chip">
                                        <i class="fas fa-briefcase"></i> ${formattedPosition}
                                    </span>
                                `;
                            }
                            
                            roleDisplay = `
                                <div style="margin-bottom: 4px;">
                                    <span class="contact-role-badge board">
                                        <i class="fas fa-crown"></i> Board Member
                                    </span>
                                    ${positionDisplay}
                                </div>
                            `;
                        } else {
                            roleDisplay = `
                                <span class="contact-role-badge ${m.member_type === 'parent' ? 'parent' : (m.member_type === 'child' ? 'child' : 'dependent')}">
                                    ${m.member_type === 'parent' ? '👨‍👩 Parent' : (m.member_type === 'child' ? '🧒 Child' : '👶 Dependent')}
                                </span>
                            `;
                        }
                        
                        return `
                            <div class="contact-card" onclick="showMemberDetails(${m.id})">
                                <div class="contact-row">
                                    <div class="contact-avatar">
                                        ${m.profile_picture ? 
                                            `<img src="${m.profile_picture}" class="contact-avatar-img" alt="${m.name}">` : 
                                            `<div class="contact-avatar-img" style="background: linear-gradient(135deg, #ff862d, #01605a); display: flex; align-items: center; justify-content: center;">
                                                <i class="fas ${m.member_type === 'board' ? 'fa-crown' : (m.member_type === 'parent' ? 'fa-user-tie' : 'fa-user-child')}" style="font-size: 18px;"></i>
                                            </div>`
                                        }
                                    </div>
                                    <div class="contact-info">
                                        <div class="contact-name">
                                            ${m.name}
                                            ${m.id === _currentUser.id ? '<span class="you-badge">You</span>' : ''}
                                        </div>
                                        ${roleDisplay}
                                        <div class="contact-details">
                                            ${m.phone ? `<div class="contact-phone"><i class="fas fa-phone-alt"></i> ${m.phone}</div>` : ''}
                                            ${m.location ? `<div class="contact-phone"><i class="fas fa-map-marker-alt"></i> ${m.location}</div>` : ''}
                                        </div>
                                    </div>
                                    <div class="contact-actions" onclick="event.stopPropagation()">
                                        ${m.phone ? `
                                            <button class="contact-action-btn whatsapp" onclick="sendWhatsApp('${m.phone}', 'Hello ${m.name} from OBUNANGWE BULAIIRE!')" title="WhatsApp">
                                                <i class="fab fa-whatsapp"></i>
                                            </button>
                                            <button class="contact-action-btn call" onclick="makeCall('${m.phone}')" title="Call">
                                                <i class="fas fa-phone"></i>
                                            </button>
                                            <button class="contact-action-btn sms" onclick="sendSMS('${m.phone}', 'Hello from OBUNANGWE BULAIIRE!')" title="SMS">
                                                <i class="fas fa-comment"></i>
                                            </button>
                                        ` : ''}
                                    </div>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    } 
    // For admin - Compact Table Layout (SHOWS BOARD POSITION)
    else {
        document.getElementById('pageContent').innerHTML = `
            <div class="card" style="padding: 12px;">
                <h2 style="font-size: 16px; margin-bottom: 10px;"><i class="fas fa-address-book"></i> Contacts Directory</h2>
                <div class="contacts-table-container">
                    <table class="contacts-table">
                        <thead>
                            <tr>
                                <th style="padding: 8px;">Photo</th>
                                <th style="padding: 8px;">Name</th>
                                <th style="padding: 8px;">Role/Position</th>
                                <th style="padding: 8px;">Phone</th>
                                <th style="padding: 8px;">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${members.map(m => {
                                // Build Role/Position display for admin table
                                let rolePositionHtml = '';
                                if (m.member_type === 'board') {
                                    let position = m.board_position || m.position || '';
                                    let positionDisplay = '';
                                    
                                    if (position && position !== '') {
                                        let formattedPosition = position.charAt(0).toUpperCase() + position.slice(1).replace('_', ' ');
                                        positionDisplay = `
                                            <div class="position-text">
                                                <i class="fas fa-briefcase"></i> ${formattedPosition}
                                            </div>
                                        `;
                                    }
                                    
                                    rolePositionHtml = `
                                        <div>
                                            <span class="role-badge board-badge">
                                                <i class="fas fa-crown"></i> Board Member
                                            </span>
                                            ${positionDisplay}
                                        </div>
                                    `;
                                } else if (m.member_type === 'parent') {
                                    rolePositionHtml = `<span class="role-badge parent-badge"><i class="fas fa-user-tie"></i> Parent</span>`;
                                } else if (m.member_type === 'child') {
                                    rolePositionHtml = `<span class="role-badge child-badge"><i class="fas fa-user-graduate"></i> Child</span>`;
                                } else {
                                    rolePositionHtml = `<span class="role-badge dependent-badge"><i class="fas fa-baby-carriage"></i> Dependent</span>`;
                                }
                                
                                return `
                                    <tr onclick="showMemberDetails(${m.id})" style="cursor: pointer;">
                                        <td style="padding: 8px;">
                                            ${m.profile_picture ? 
                                                `<img src="${m.profile_picture}" class="member-avatar-table">` : 
                                                `<div class="member-avatar-placeholder"><i class="fas ${m.member_type === 'board' ? 'fa-crown' : (m.member_type === 'parent' ? 'fa-user-tie' : 'fa-user-child')}" style="font-size: 14px;"></i></div>`
                                            }
                                        </td>
                                        <td style="padding: 8px; font-weight: 600; color: #01605a;">${m.name}${m.id === _currentUser?.id ? ' <span class="you-badge">You</span>' : ''}</td>
                                        <td style="padding: 8px;">${rolePositionHtml}</td>
                                        <td style="padding: 8px; font-size: 12px;">${m.phone || '—'}</td>
                                        <td style="padding: 8px;">
                                            <div class="table-action-icons" onclick="event.stopPropagation()">
                                                ${m.phone ? `
                                                    <button class="table-icon-btn whatsapp" onclick="sendWhatsApp('${m.phone}', 'Hello ${m.name} from OBUNANGWE BULAIIRE!')" title="WhatsApp">
                                                        <i class="fab fa-whatsapp"></i>
                                                    </button>
                                                    <button class="table-icon-btn call" onclick="makeCall('${m.phone}')" title="Call">
                                                        <i class="fas fa-phone"></i>
                                                    </button>
                                                    <button class="table-icon-btn sms" onclick="sendSMS('${m.phone}', 'Hello from OBUNANGWE BULAIIRE!')" title="SMS">
                                                        <i class="fas fa-comment"></i>
                                                    </button>
                                                ` : '<span style="font-size: 11px; color: #999;">—</span>'}
                                            </div>
                                        </td>
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }
}

// Admin Reports
async function renderAdminReports() {
    const stats = await getStatistics();
    const members = await getFamilyMembers();
    const payingMembers = members.filter(m => m.member_type === 'board' || m.member_type === 'parent');
    const memberStats = [];
    for (const m of members) {
        const s = await getUserStatistics(m.id);
        memberStats.push({ ...m, stats: s });
    }
    
    document.getElementById('pageContent').innerHTML = `
        <div class="stats-grid">
            <div class="stat-card"><div class="stat-number">${members.length}</div><h3>Total Members</h3></div>
            <div class="stat-card"><div class="stat-number">${payingMembers.length}</div><h3>Paying Members</h3></div>
            <div class="stat-card"><div class="stat-number">${_activities.length}</div><h3>Activities</h3></div>
            <div class="stat-card"><div class="stat-number">${stats.totalOwed > 0 ? ((stats.totalCollected / stats.totalOwed * 100)).toFixed(1) : 0}%</div><h3>Progress</h3></div>
        </div>
        
        <div class="card">
            <h2>Member Summary <button class="btn-whatsapp" onclick="generateShareableReport()"><i class="fab fa-whatsapp"></i> Share Report</button></h2>
            <div class="members-table-container">
                <table class="members-table" style="width: 100%;">
                    <thead>
                        <tr>
                            <th>Photo</th><th>Member</th><th>Type</th><th>Payer</th><th>Owed (UGX)</th><th>Paid (UGX)</th><th>Balance (UGX)</th><th>Status</th><th>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${memberStats.map(m => {
                            const responsible = getPaymentResponsibleMember(m);
                            const balanceClass = m.stats.balance === 0 ? 'balance-zero' : (m.stats.balance > 0 ? 'balance-positive' : 'balance-negative');
                            return `
                                <tr onclick="showMemberDetails(${m.id})">
                                    <td>${m.profile_picture ? `<img src="${m.profile_picture}" class="member-avatar-table">` : `<div class="member-avatar-placeholder"><i class="fas ${m.member_type === 'board' ? 'fa-crown' : (m.member_type === 'parent' ? 'fa-user-tie' : 'fa-user-child')}"></i></div>`}</td>
                                    <td class="member-name-cell">${m.name}</td>
                                    <td><span class="member-type-badge member-type-${m.member_type}">${m.member_type === 'board' ? 'Board' : (m.member_type === 'parent' ? 'Parent' : (m.member_type === 'child' ? 'Child' : 'Dependent'))}</span></td>
                                    <td>${responsible && responsible.id !== m.id ? responsible.name : '<span class="payment-responsible">Self</span>'}</td>
                                    <td class="balance-positive">UGX ${(m.stats.totalOwed || 0).toLocaleString()}</td>
                                    <td style="color: var(--success);">UGX ${(m.stats.totalPaid || 0).toLocaleString()}</td>
                                    <td class="${balanceClass}">UGX ${(m.stats.balance || 0).toLocaleString()}</td>
                                    <td class="${m.stats.balance === 0 ? 'status-settled' : 'status-pending'}">${m.stats.balance === 0 ? '✅ Settled' : (m.stats.balance > 0 ? '⚠️ Pending' : '✅ Overpaid')}</td>
                                    <td onclick="event.stopPropagation()">${m.phone && m.stats.balance > 0 ? `<button class="contact-icon-btn whatsapp" onclick="sendWhatsApp('${m.phone}', 'Reminder: You have UGX ${(m.stats.balance || 0).toLocaleString()} pending')"><i class="fab fa-whatsapp"></i> Remind</button>` : '—'}</td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        </div>
        
        <div class="card">
            <h2>Activity Summary</h2>
            <div class="members-table-container">
                <table class="members-table" style="width: 100%;">
                    <thead>
                        <tr><th>Activity</th><th>Budget (UGX)</th><th>Collected (UGX)</th><th>Pending (UGX)</th><th>Progress</th><th>Status</th></tr>
                    </thead>
                    <tbody>
                        ${_activities.map(a => {
                            const collected = a.memberPayments?.reduce((sum, mp) => sum + (mp.amount_paid || 0), 0) || 0;
                            const pending = (a.totalBudget || 0) - collected;
                            const progress = a.totalBudget > 0 ? (collected / a.totalBudget * 100).toFixed(1) : 0;
                            return `
                                <tr onclick="showActivityDetails(${a.id})" style="cursor:pointer">
                                    <td><strong>${a.name}</strong></td>
                                    <td>UGX ${(a.totalBudget || 0).toLocaleString()}</td>
                                    <td style="color: var(--success);">UGX ${collected.toLocaleString()}</td>
                                    <td class="balance-positive">UGX ${pending.toLocaleString()}</td>
                                    <td><div class="progress-bar-container"><div class="progress-bar" style="width:${progress}%">${progress}%</div></div></div></td>
                                    <td><span class="badge badge-${a.status}">${a.status}</span></td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

// User Dashboard
// ============================================
// FIXED USER DASHBOARD - NO MEMBERS DISPLAYED
// ============================================
async function renderUserDashboard() {
    const userStats = await getUserStatistics(_currentUser.id);
    const userActivities = await getMemberActivities(_currentUser.id);
    
    document.getElementById('pageContent').innerHTML = `
        <div class="stats-grid">
            <div class="stat-card"><div class="stat-number">UGX ${userStats.totalOwed.toLocaleString()}</div><h3>My Total Owed</h3></div>
            <div class="stat-card"><div class="stat-number">UGX ${userStats.totalPaid.toLocaleString()}</div><h3>My Total Paid</h3></div>
            <div class="stat-card"><div class="stat-number">UGX ${userStats.balance.toLocaleString()}</div><h3>My Balance</h3></div>
            <div class="stat-card"><div class="stat-number">${userActivities.length}</div><h3>My Activities</h3></div>
        </div>
        
        <div class="card">
            <h2>My Activities</h2>
            <div class="activity-grid">
                ${userActivities.map(a => {
                    const balance = a.memberData.amountOwed - a.memberData.amountPaid;
                    const paidPercent = a.memberData.amountOwed > 0 ? (a.memberData.amountPaid / a.memberData.amountOwed * 100).toFixed(0) : 0;
                    return `
                        <div class="activity-card">
                            <h3>${a.name} ${a.status === 'completed' ? '✅' : ''}</h3>
                            ${a.status === 'completed' ? '<div class="completion-notification"><i class="fas fa-check-circle"></i> Activity Completed! 🎉</div>' : ''}
                            <p><strong>💰 Total Budget:</strong> UGX ${(a.totalBudget || 0).toLocaleString()}</p>
                            <p><strong>👤 My Share:</strong> UGX ${a.memberData.amountOwed.toLocaleString()}</p>
                            <p><strong>✅ I've Paid:</strong> UGX ${a.memberData.amountPaid.toLocaleString()}</p>
                            ${a.memberData.adjustmentAmount ? `<p><strong>⚙️ Adjustment:</strong> UGX ${a.memberData.adjustmentAmount.toLocaleString()}</p>` : ''}
                            <div class="progress-bar-container"><div class="progress-bar" style="width:${paidPercent}%">${paidPercent}% paid</div></div>
                            ${balance === 0 ? '<span class="paid-status">✅ Fully paid! Great job! 🎉</span>' : `<span class="unpaid-status">❌ Pending: UGX ${balance.toLocaleString()}</span>`}
                        </div>
                    `;
                }).join('') || '<p style="text-align:center; padding: 40px;">No activities assigned to you yet.</p>'}
            </div>
        </div>
        
        <div class="card">
            <h2><i class="fas fa-info-circle"></i> Quick Info</h2>
            <div style="text-align: center; padding: 20px;">
                <i class="fas fa-hand-holding-heart" style="font-size: 48px; color: var(--primary-orange); margin-bottom: 15px; display: block;"></i>
                <p>Use the <strong>Contacts</strong> page to view family member contact information.</p>
                <p>Use the <strong>Reports</strong> page to see your payment summary.</p>
                <button class="btn-primary" onclick="switchPage('contacts')" style="margin-top: 15px;">
                    <i class="fas fa-address-book"></i> Go to Contacts
                </button>
            </div>
        </div>
    `;
}

// ============================================
// FIXED CONTACTS PAGE - LIMITED INFO FOR USERS
// ============================================
async function renderContacts() {
    const members = await getFamilyMembers();
    
    if (members.length === 0) {
        document.getElementById('pageContent').innerHTML = `
            <div class="card">
                <h2><i class="fas fa-address-book"></i> Contacts</h2>
                <div style="text-align:center;padding:40px">
                    <i class="fas fa-users" style="font-size:48px;color:var(--gray-400);margin-bottom:16px;display:block;"></i>
                    <p>No contacts yet. Add family members.</p>
                    ${_currentRole === 'admin' ? '<button class="btn-primary" onclick="switchPage(\'members\')" style="margin-top:16px;">Add Members →</button>' : ''}
                </div>
            </div>
        `;
        return;
    }
    
    // For regular users, only show limited info (no medical, no payment details)
    if (_currentRole === 'user') {
        document.getElementById('pageContent').innerHTML = `
            <div class="card">
                <h2><i class="fas fa-address-book"></i> Family Contacts</h2>
                <p style="margin-bottom: 15px; color: var(--gray-600);">
                    <i class="fas fa-info-circle"></i> Contact information for family members
                </p>
                <div class="members-table-container">
                    <table class="members-table" style="width: 100%;">
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Role</th>
                                <th>Phone</th>
                                <th>Email</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${members.map(m => `
                                <tr>
                                    <td class="member-name-cell">${m.name} ${m.id === _currentUser.id ? '<span style="background:var(--success);padding:2px 8px;border-radius:20px;font-size:10px;margin-left:5px;">You</span>' : ''}</td>
                                    <td><span class="member-type-badge member-type-${m.member_type}">${m.member_type === 'board' ? 'Board Member' : (m.member_type === 'parent' ? 'Parent' : (m.member_type === 'child' ? 'Child' : 'Dependent'))}</span></td>
                                    <td>${m.phone || '—'}</td>
                                    <td>${m.email || '—'}</td>
                                    <td>
                                        <div class="contact-icons">
                                            ${m.phone ? `
                                                <button class="contact-icon-btn whatsapp" onclick="sendWhatsApp('${m.phone}', 'Hello ${m.name} from OBUNANGWE BULAIIRE!')" title="WhatsApp">
                                                    <i class="fab fa-whatsapp"></i> WhatsApp
                                                </button>
                                                <button class="contact-icon-btn call" onclick="makeCall('${m.phone}')" title="Call">
                                                    <i class="fas fa-phone"></i> Call
                                                </button>
                                                <button class="contact-icon-btn sms" onclick="sendSMS('${m.phone}', 'Hello from OBUNANGWE BULAIIRE!')" title="SMS">
                                                    <i class="fas fa-comment"></i> SMS
                                                </button>
                                            ` : '<span class="member-tooltip">No contact</span>'}
                                        </div>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    } 
    // For admin, show full details
    else {
        document.getElementById('pageContent').innerHTML = `
            <div class="card">
                <h2><i class="fas fa-address-book"></i> Contacts Directory</h2>
                <div class="members-table-container">
                    <table class="members-table" style="width: 100%;">
                        <thead>
                            <tr>
                                <th>Photo</th>
                                <th>Name</th>
                                <th>Type</th>
                                <th>Phone</th>
                                <th>Email</th>
                                <th>Location</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${members.map(m => `
                                <tr onclick="showMemberDetails(${m.id})" style="cursor:pointer">
                                    <td>${m.profile_picture ? `<img src="${m.profile_picture}" class="member-avatar-table">` : `<div class="member-avatar-placeholder"><i class="fas ${m.member_type === 'board' ? 'fa-crown' : (m.member_type === 'parent' ? 'fa-user-tie' : 'fa-user-child')}"></i></div>`}</td>
                                    <td class="member-name-cell">${m.name}${m.id === _currentUser?.id ? ' (You)' : ''}</td>
                                    <td><span class="member-type-badge member-type-${m.member_type}">${m.member_type === 'board' ? 'Board' : (m.member_type === 'parent' ? 'Parent' : (m.member_type === 'child' ? 'Child' : 'Dependent'))}</span></td>
                                    <td>${m.phone || '—'}</td>
                                    <td>${m.email || '—'}</td>
                                    <td>${m.location || '—'}</td>
                                    <td>
                                        <div class="contact-icons" onclick="event.stopPropagation()">
                                            ${m.phone ? `
                                                <button class="contact-icon-btn whatsapp" onclick="sendWhatsApp('${m.phone}', 'Hello ${m.name} from OBUNANGWE BULAIIRE!')" title="WhatsApp">
                                                    <i class="fab fa-whatsapp"></i>
                                                </button>
                                                <button class="contact-icon-btn call" onclick="makeCall('${m.phone}')" title="Call">
                                                    <i class="fas fa-phone"></i>
                                                </button>
                                            ` : '—'}
                                        </div>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }
}

// ============================================
// FIXED SHOW MEMBER DETAILS - LIMITED FOR USERS
// ============================================
async function showMemberDetails(memberId) {
    const member = _familyMembers.find(m => m.id === memberId);
    if (!member) return;
    
    // For regular users, only show limited information
    if (_currentRole === 'user') {
        const html = `
            <div class="member-profile-card">
                <div class="member-profile-header">
                    <div class="member-profile-picture">
                        ${member.profile_picture ? 
                            `<img src="${member.profile_picture}" alt="${member.name}">` : 
                            `<i class="fas fa-user-circle"></i>`
                        }
                    </div>
                    <div class="member-profile-name">${member.name}</div>
                    <div class="member-profile-role">
                        <span class="member-type-badge member-type-${member.member_type}">
                            ${member.member_type === 'board' ? '🏛️ Board Member' : (member.member_type === 'parent' ? '👨‍👩 Parent' : (member.member_type === 'child' ? '🧒 Child' : '👶 Dependent'))}
                        </span>
                    </div>
                </div>
                <div class="member-profile-body">
                    <div class="member-info-group">
                        <h4><i class="fas fa-address-card"></i> Contact Information</h4>
                        ${member.phone ? `<div class="member-info-row"><span class="member-info-label">📱 Phone:</span><span class="member-info-value">${member.phone}</span></div>` : ''}
                        ${member.email ? `<div class="member-info-row"><span class="member-info-label">📧 Email:</span><span class="member-info-value">${member.email}</span></div>` : ''}
                        ${member.location ? `<div class="member-info-row"><span class="member-info-label">📍 Location:</span><span class="member-info-value">${member.location}</span></div>` : ''}
                    </div>
                    
                    ${member.bio ? `
                    <div class="member-info-group">
                        <h4><i class="fas fa-heart"></i> About</h4>
                        <div class="member-info-value">${member.bio}</div>
                    </div>
                    ` : ''}
                    
                    <div class="member-info-group">
                        <h4><i class="fas fa-comment"></i> Quick Actions</h4>
                        <div style="display: flex; gap: 10px; flex-wrap: wrap; margin-top: 10px;">
                            ${member.phone ? `
                                <button class="btn-whatsapp" onclick="sendWhatsApp('${member.phone}', 'Hello ${member.name} from OBUNANGWE BULAIIRE!')" style="display: inline-flex; align-items: center; gap: 8px;">
                                    <i class="fab fa-whatsapp"></i> WhatsApp
                                </button>
                                <button class="btn-primary" onclick="makeCall('${member.phone}')" style="display: inline-flex; align-items: center; gap: 8px;">
                                    <i class="fas fa-phone"></i> Call
                                </button>
                                <button class="btn-edit" onclick="sendSMS('${member.phone}', 'Hello from OBUNANGWE BULAIIRE!')" style="display: inline-flex; align-items: center; gap: 8px;">
                                    <i class="fas fa-comment"></i> SMS
                                </button>
                            ` : '<p>No contact information available</p>'}
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.getElementById('memberDetailsContent').innerHTML = html;
        document.getElementById('memberDetailsModal').style.display = 'flex';
        return;
    }
    
    // For admin, show full details (medical, payment, etc.)
    const medicalInfo = [];
    if (member.blood_group) medicalInfo.push(`Blood: ${member.blood_group}`);
    if (member.allergies) medicalInfo.push(`Allergies: ${member.allergies}`);
    
    const responsible = getPaymentResponsibleMember(member);
    const stats = await getUserStatistics(member.id);
    
    const html = `
        <div class="member-profile-card">
            <div class="member-profile-header">
                <div class="member-profile-picture">
                    ${member.profile_picture ? 
                        `<img src="${member.profile_picture}" alt="${member.name}">` : 
                        `<i class="fas fa-user-circle"></i>`
                    }
                </div>
                <div class="member-profile-name">${member.name}</div>
                <div class="member-profile-role">
                    <span class="member-type-badge member-type-${member.member_type}">
                        ${member.member_type === 'board' ? '🏛️ Board Member' : (member.member_type === 'parent' ? '👨‍👩 Parent' : (member.member_type === 'child' ? '🧒 Child' : '👶 Dependent'))}
                    </span>
                    ${member.board_position ? `<span style="margin-left:5px">(${member.board_position})</span>` : ''}
                </div>
            </div>
            <div class="member-profile-body">
                <div class="member-info-group">
                    <h4><i class="fas fa-chart-line"></i> Payment Summary</h4>
                    <div class="member-info-row"><span class="member-info-label">💰 Total Owed:</span><span class="member-info-value">UGX ${(stats.totalOwed || 0).toLocaleString()}</span></div>
                    <div class="member-info-row"><span class="member-info-label">✅ Total Paid:</span><span class="member-info-value" style="color:var(--success)">UGX ${(stats.totalPaid || 0).toLocaleString()}</span></div>
                    <div class="member-info-row"><span class="member-info-label">⚖️ Balance:</span><span class="member-info-value ${stats.balance === 0 ? 'balance-zero' : 'balance-positive'}">UGX ${(stats.balance || 0).toLocaleString()}</span></div>
                </div>
                
                <div class="member-info-group">
                    <h4><i class="fas fa-address-card"></i> Personal Information</h4>
                    ${member.date_of_birth ? `<div class="member-info-row"><span class="member-info-label">🎂 Birthday:</span><span class="member-info-value">${new Date(member.date_of_birth).toLocaleDateString()}</span></div>` : ''}
                    ${member.occupation ? `<div class="member-info-row"><span class="member-info-label">💼 Occupation:</span><span class="member-info-value">${member.occupation}</span></div>` : ''}
                    ${member.location ? `<div class="member-info-row"><span class="member-info-label">📍 Location:</span><span class="member-info-value">${member.location}</span></div>` : ''}
                    ${member.marital_status ? `<div class="member-info-row"><span class="member-info-label">💍 Status:</span><span class="member-info-value">${member.marital_status}</span></div>` : ''}
                    ${member.anniversary_date ? `<div class="member-info-row"><span class="member-info-label">💕 Anniversary:</span><span class="member-info-value">${new Date(member.anniversary_date).toLocaleDateString()}</span></div>` : ''}
                    ${member.favorite_color ? `<div class="member-info-row"><span class="member-info-label">🎨 Favorite Color:</span><span class="member-info-value"><span class="favorite-color-dot" style="background: ${member.favorite_color}"></span> ${member.favorite_color}</span></div>` : ''}
                </div>
                
                ${medicalInfo.length > 0 ? `<div class="member-info-group"><h4><i class="fas fa-notes-medical"></i> Medical Information</h4><div class="member-info-value">${medicalInfo.map(info => `<span class="medical-badge">${info}</span>`).join('')}</div></div>` : ''}
                
                ${member.emergency_contact ? `<div class="member-info-group"><h4><i class="fas fa-phone-alt"></i> Emergency Contact</h4><div class="member-info-value">${member.emergency_contact}</div></div>` : ''}
                
                ${responsible && responsible.id !== member.id ? `<div class="member-info-group"><h4><i class="fas fa-money-bill-wave"></i> Payment Responsibility</h4><div class="member-info-value">Payments handled by: <strong>${responsible.name}</strong> (${responsible.member_type === 'board' ? 'Board Member' : 'Parent'})</div></div>` : ''}
                
                ${member.bio ? `<div class="member-info-group"><h4><i class="fas fa-heart"></i> About</h4><div class="member-info-value">${member.bio}</div></div>` : ''}
                
                <div class="member-info-group">
                    <h4><i class="fas fa-address-book"></i> Contact</h4>
                    ${member.phone ? `<div class="member-info-row"><span class="member-info-label">📱 Phone:</span><span class="member-info-value">${member.phone}</span></div>` : ''}
                    ${member.email ? `<div class="member-info-row"><span class="member-info-label">📧 Email:</span><span class="member-info-value">${member.email}</span></div>` : ''}
                </div>
                
                <div class="member-info-group">
                    <h4><i class="fas fa-comment"></i> Quick Actions</h4>
                    <div style="display: flex; gap: 10px; flex-wrap: wrap; margin-top: 10px;">
                        ${member.phone ? `
                            <button class="btn-whatsapp" onclick="sendWhatsApp('${member.phone}', 'Hello ${member.name} from OBUNANGWE BULAIIRE!')" style="display: inline-flex; align-items: center; gap: 8px;">
                                <i class="fab fa-whatsapp"></i> WhatsApp
                            </button>
                            <button class="btn-primary" onclick="makeCall('${member.phone}')" style="display: inline-flex; align-items: center; gap: 8px;">
                                <i class="fas fa-phone"></i> Call
                            </button>
                            <button class="btn-edit" onclick="sendSMS('${member.phone}', 'Hello from OBUNANGWE BULAIIRE!')" style="display: inline-flex; align-items: center; gap: 8px;">
                                <i class="fas fa-comment"></i> SMS
                            </button>
                        ` : '<p>No contact information available</p>'}
                    </div>
                </div>
            </div>
        </div>
    `;
    
    document.getElementById('memberDetailsContent').innerHTML = html;
    document.getElementById('memberDetailsModal').style.display = 'flex';
}

// ============================================
// UPDATE showUserDashboard to remove members section
// ============================================
// (Already updated above)

// ============================================
// UPDATE renderUserMyActivities - clean version
// ============================================
async function renderUserMyActivities() {
    const userActivities = await getMemberActivities(_currentUser.id);
    document.getElementById('pageContent').innerHTML = `
        <div class="card">
            <h2>My Activities</h2>
            <div class="activity-grid">
                ${userActivities.map(a => {
                    const balance = a.memberData.amountOwed - a.memberData.amountPaid;
                    const paidPercent = a.memberData.amountOwed > 0 ? (a.memberData.amountPaid / a.memberData.amountOwed * 100).toFixed(0) : 0;
                    return `
                        <div class="activity-card">
                            <h3>${a.name} ${a.status === 'completed' ? '✅' : ''}</h3>
                            ${a.status === 'completed' ? '<div class="completion-notification"><i class="fas fa-check-circle"></i> Activity Completed! 🎉</div>' : ''}
                            <p><strong>💰 Total Budget:</strong> UGX ${(a.totalBudget || 0).toLocaleString()}</p>
                            <p><strong>👤 My Share:</strong> UGX ${a.memberData.amountOwed.toLocaleString()}</p>
                            <p><strong>✅ I've Paid:</strong> UGX ${a.memberData.amountPaid.toLocaleString()}</p>
                            ${a.memberData.adjustmentAmount ? `<p><strong>⚙️ Adjustment:</strong> UGX ${a.memberData.adjustmentAmount.toLocaleString()}</p>` : ''}
                            <div class="progress-bar-container"><div class="progress-bar" style="width:${paidPercent}%">${paidPercent}% paid</div></div>
                            ${balance === 0 ? '<span class="paid-status">✅ Fully paid! Great job! 🎉</span>' : `<span class="unpaid-status">❌ Pending: UGX ${balance.toLocaleString()}</span>`}
                        </div>
                    `;
                }).join('') || '<p style="text-align:center; padding: 40px;">No activities assigned to you yet.</p>'}
            </div>
        </div>
    `;
}

async function renderUserMyActivities() {
    const userActivities = await getMemberActivities(_currentUser.id);
    document.getElementById('pageContent').innerHTML = `
        <div class="card">
            <h2>My Activities</h2>
            <div class="activity-grid">
                ${userActivities.map(a => {
                    const balance = a.memberData.amountOwed - a.memberData.amountPaid;
                    const paidPercent = a.memberData.amountOwed > 0 ? (a.memberData.amountPaid / a.memberData.amountOwed * 100).toFixed(0) : 0;
                    return `
                        <div class="activity-card">
                            <h3>${a.name} ${a.status === 'completed' ? '✅' : ''}</h3>
                            ${a.status === 'completed' ? '<div class="completion-notification"><i class="fas fa-check-circle"></i> Activity Completed! 🎉</div>' : ''}
                            <p><strong>💰 Total Budget:</strong> UGX ${(a.totalBudget || 0).toLocaleString()}</p>
                            <p><strong>👤 My Share:</strong> UGX ${a.memberData.amountOwed.toLocaleString()}</p>
                            <p><strong>✅ I've Paid:</strong> UGX ${a.memberData.amountPaid.toLocaleString()}</p>
                            ${a.memberData.adjustmentAmount ? `<p><strong>⚙️ Adjustment:</strong> UGX ${a.memberData.adjustmentAmount.toLocaleString()}</p>` : ''}
                            <div class="progress-bar-container"><div class="progress-bar" style="width:${paidPercent}%">${paidPercent}% paid</div></div>
                            ${balance === 0 ? '<span class="paid-status">✅ Fully paid! Great job! 🎉</span>' : `<span class="unpaid-status">❌ Pending: UGX ${balance.toLocaleString()}</span>`}
                        </div>
                    `;
                }).join('') || '<p style="text-align:center; padding: 40px;">No activities assigned to you yet.</p>'}
            </div>
        </div>
    `;
}

async function renderUserReports() {
    const userStats = await getUserStatistics(_currentUser.id);
    const userActivities = await getMemberActivities(_currentUser.id);
    document.getElementById('pageContent').innerHTML = `
        <div class="stats-grid">
            <div class="stat-card"><div class="stat-number">UGX ${userStats.totalOwed.toLocaleString()}</div><h3>My Owed</h3></div>
            <div class="stat-card"><div class="stat-number">UGX ${userStats.totalPaid.toLocaleString()}</div><h3>My Paid</h3></div>
            <div class="stat-card"><div class="stat-number">UGX ${userStats.balance.toLocaleString()}</div><h3>My Balance</h3></div>
        </div>
        <div class="card">
            <h2>My Activity Status</h2>
            <div class="activity-grid">
                ${userActivities.map(a => {
                    const balance = a.memberData.amountOwed - a.memberData.amountPaid;
                    const paidPercent = a.memberData.amountOwed > 0 ? (a.memberData.amountPaid / a.memberData.amountOwed * 100).toFixed(0) : 0;
                    return `
                        <div class="activity-card">
                            <h3>${a.name} ${a.status === 'completed' ? '✅' : ''}</h3>
                            ${a.status === 'completed' ? '<div class="completion-notification"><i class="fas fa-check-circle"></i> Activity Completed! 🎉</div>' : ''}
                            <p><strong>💰 My Share:</strong> UGX ${a.memberData.amountOwed.toLocaleString()}</p>
                            <p><strong>✅ Paid:</strong> UGX ${a.memberData.amountPaid.toLocaleString()}</p>
                            <div class="progress-bar-container"><div class="progress-bar" style="width:${paidPercent}%">${paidPercent}% paid</div></div>
                            ${balance === 0 ? '<span class="paid-status">✅ Fully paid! Excellent! 🎉</span>' : `<span class="unpaid-status">❌ Pending: UGX ${balance.toLocaleString()}</span>`}
                        </div>
                    `;
                }).join('') || '<p style="text-align:center; padding: 40px;">No activities assigned</p>'}
            </div>
        </div>
    `;
}

async function renderSecurity() {
    document.getElementById('pageContent').innerHTML = `
        <div class="card">
            <h2>Security Settings</h2>
            <div style="text-align:center;padding:30px">
                <i class="fas fa-lock" style="font-size:48px;color:var(--primary-orange);margin-bottom:15px;display:block;"></i>
                <p style="margin-bottom:20px;">Change administrator password</p>
                <button class="btn-primary" onclick="changePassword()">Change Password</button>
            </div>
        </div>
        <div class="card">
            <h2>System Information</h2>
            <div class="members-table-container">
                <table class="data-table" style="width:100%;">
                    <tr><td><strong>Version</strong></td><td>3.0.0</td></tr>
                    <tr><td><strong>Database</strong></td><td>Supabase</td></tr>
                    <tr><td><strong>Activities</strong></td><td>${_activities.length}</td></tr>
                    <tr><td><strong>Members</strong></td><td>${_familyMembers.length}</td></tr>
                    <tr><td><strong>Paying Members</strong></td><td>${_familyMembers.filter(m => m.member_type === 'board' || m.member_type === 'parent').length}</td></tr>
                </table>
            </div>
        </div>
    `;
}

async function renderCurrentPage() {
    if (_currentRole === 'admin') {
        if (_currentPage === 'dashboard') await renderAdminDashboard();
        else if (_currentPage === 'activities') await renderAdminActivities();
        else if (_currentPage === 'members') await renderAdminMembers();
        else if (_currentPage === 'payments') await renderAdminPayments();
        else if (_currentPage === 'paymentsummary') await renderPaymentSummary();
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
// TOGGLE FUNCTIONS FOR MEMBER TYPES
// ============================================
function toggleMemberTypeFields() {
    const memberType = document.getElementById('memberType')?.value;
    const boardPositionDiv = document.getElementById('boardPositionDiv');
    const parentSelectDiv = document.getElementById('parentSelectDiv');
    
    if (memberType === 'board') {
        if (boardPositionDiv) boardPositionDiv.style.display = 'block';
        if (parentSelectDiv) parentSelectDiv.style.display = 'none';
    } else if (memberType === 'parent') {
        if (boardPositionDiv) boardPositionDiv.style.display = 'none';
        if (parentSelectDiv) parentSelectDiv.style.display = 'none';
    } else if (memberType === 'child' || memberType === 'dependent') {
        if (boardPositionDiv) boardPositionDiv.style.display = 'none';
        if (parentSelectDiv) parentSelectDiv.style.display = 'block';
    }
}

function toggleEditMemberTypeFields() {
    const memberType = document.getElementById('editMemberType')?.value;
    const boardPositionDiv = document.getElementById('editBoardPositionDiv');
    const parentSelectDiv = document.getElementById('editParentSelectDiv');
    
    if (memberType === 'board') {
        if (boardPositionDiv) boardPositionDiv.style.display = 'block';
        if (parentSelectDiv) parentSelectDiv.style.display = 'none';
        // Clear parent selection for board members
        document.getElementById('editMemberParentId').value = '';
    } else if (memberType === 'parent') {
        if (boardPositionDiv) boardPositionDiv.style.display = 'none';
        if (parentSelectDiv) parentSelectDiv.style.display = 'none';
        // Clear parent selection for parents
        document.getElementById('editMemberParentId').value = '';
    } else if (memberType === 'child' || memberType === 'dependent') {
        if (boardPositionDiv) boardPositionDiv.style.display = 'none';
        if (parentSelectDiv) parentSelectDiv.style.display = 'block';
    }
}

// ============================================
// POPULATE DROPDOWNS
// ============================================
async function populateParentDropdown() {
    const members = await getFamilyMembers();
    const parents = members.filter(m => m.member_type === 'parent' || m.member_type === 'board');
    const parentSelect = document.getElementById('memberParentId');
    if (parentSelect) {
        parentSelect.innerHTML = '<option value="">Select parent/guardian</option>' + 
            parents.map(p => `<option value="${p.id}">${p.name} (${p.member_type === 'board' ? 'Board Member' : 'Parent'})</option>`).join('');
    }
}

async function populateEditParentDropdown(excludeId) {
    const members = await getFamilyMembers();
    const parents = members.filter(m => (m.member_type === 'parent' || m.member_type === 'board') && m.id !== excludeId);
    const parentSelect = document.getElementById('editMemberParentId');
    if (parentSelect) {
        const currentVal = parentSelect.value;
        parentSelect.innerHTML = '<option value="">Select parent/guardian</option>' + 
            parents.map(p => `<option value="${p.id}" ${currentVal == p.id ? 'selected' : ''}>${p.name} (${p.member_type === 'board' ? 'Board Member' : 'Parent'})</option>`).join('');
    }
}

// ============================================
// UI FUNCTIONS - MODALS
// ============================================
function openAddModal() {
    if (_currentRole !== 'admin') { 
        Swal.fire('Access Denied', 'Only administrators can add', 'error'); 
        return; 
    }
    
    if (_currentPage === 'activities') {
        document.getElementById('addActivityModal').style.display = 'flex';
    } 
    else if (_currentPage === 'members') {
        const form = document.getElementById('addMemberForm');
        if (form) form.reset();
        
        const preview = document.getElementById('addImagePreview');
        if (preview) preview.innerHTML = '<i class="fas fa-camera"></i><span>Add Photo</span>';
        
        const memberType = document.getElementById('memberType');
        if (memberType) memberType.value = 'parent';
        toggleMemberTypeFields();
        
        window._addImageBase64 = null;
        populateParentDropdown();
        
        document.getElementById('addMemberModal').style.display = 'flex';
    } 
    else if (_currentPage === 'payments') {
        (async () => {
            const acts = (await getActivities()).filter(a => a.status === 'active');
            const members = await getFamilyMembers();
            const activitySelect = document.getElementById('paymentActivityId');
            const memberSelect = document.getElementById('paymentMemberId');
            
            if (activitySelect) {
                activitySelect.innerHTML = acts.map(a => `<option value="${a.id}">${a.name} - UGX ${a.totalBudget.toLocaleString()}</option>`).join('');
            }
            if (memberSelect) {
                memberSelect.innerHTML = members.map(m => `<option value="${m.id}">${m.name} (${m.member_type === 'board' ? 'Board Member' : (m.member_type === 'parent' ? 'Parent' : 'Child')})</option>`).join('');
            }
            const paymentDate = document.getElementById('paymentDate');
            if (paymentDate) paymentDate.value = new Date().toISOString().split('T')[0];
            
            document.getElementById('paymentModal').style.display = 'flex';
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
        document.getElementById('editMemberPhone').value = m.phone || '';
        document.getElementById('editMemberEmail').value = m.email || '';
        document.getElementById('editMemberDob').value = m.date_of_birth || '';
        document.getElementById('editMemberBloodGroup').value = m.blood_group || '';
        document.getElementById('editMemberAllergies').value = m.allergies || '';
        document.getElementById('editMemberEmergencyContact').value = m.emergency_contact || '';
        document.getElementById('editMemberOccupation').value = m.occupation || '';
        document.getElementById('editMemberLocation').value = m.location || '';
        document.getElementById('editMemberMaritalStatus').value = m.marital_status || '';
        document.getElementById('editMemberAnniversary').value = m.anniversary_date || '';
        document.getElementById('editMemberBio').value = m.bio || '';
        document.getElementById('editMemberFavoriteColor').value = m.favorite_color || '#01605a';
        document.getElementById('editMemberType').value = m.member_type || (m.role === 'parent' ? 'parent' : 'child');
        document.getElementById('editMemberBoardPosition').value = m.board_position || '';
        
        // CRITICAL: Set parentId to empty string if null
        document.getElementById('editMemberParentId').value = m.parent_id || '';
        
        toggleEditMemberTypeFields();
        await populateEditParentDropdown(m.id);
        
        const preview = document.getElementById('editImagePreview');
        if (m.profile_picture) {
            preview.innerHTML = `<img src="${m.profile_picture}" alt="${m.name}">`;
        } else {
            preview.innerHTML = '<i class="fas fa-camera"></i><span>Change Photo</span>';
        }
        window._editImageBase64 = null;
        document.getElementById('editMemberModal').style.display = 'flex';
    })();
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'none';
    }
}

async function changePassword() {
    const { value: password } = await Swal.fire({
        title: 'Change Admin Password',
        html: `<div style="text-align:left;"><p>Enter new password:</p><input type="password" id="newPassword" class="swal2-input" placeholder="New password" style="width:100%;"><input type="password" id="confirmPassword" class="swal2-input" placeholder="Confirm password" style="width:100%;margin-top:10px;"><p style="font-size:12px;color:#666;margin-top:10px;">Minimum 4 characters</p></div>`,
        focusConfirm: false,
        preConfirm: () => {
            const newPwd = document.getElementById('newPassword').value;
            const confirmPwd = document.getElementById('confirmPassword').value;
            if (!newPwd) { Swal.showValidationMessage('Please enter a password'); return false; }
            if (newPwd.length < 4) { Swal.showValidationMessage('Password must be at least 4 characters'); return false; }
            if (newPwd !== confirmPwd) { Swal.showValidationMessage('Passwords do not match'); return false; }
            return newPwd;
        },
        showCancelButton: true,
        confirmButtonText: 'Change Password',
        cancelButtonText: 'Cancel'
    });
    
    if (password) {
        localStorage.setItem('admin_password', password);
        await _supabase.from('admin_settings').upsert({ setting_key: 'admin_password', setting_value: password }).eq('setting_key', 'admin_password');
        Swal.fire('Success!', 'Admin password changed successfully.', 'success');
    }
}

function switchPage(page) {
    _currentPage = page;
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    if (window.event && window.event.target) {
        const clickedItem = window.event.target.closest('.nav-item');
        if (clickedItem) clickedItem.classList.add('active');
    }
    const titles = { 
        dashboard: 'Dashboard', 
        myactivities: 'My Activities', 
        activities: 'Activities', 
        members: 'Members', 
        payments: 'Payments', 
        paymentsummary: 'Payment Summary',
        contacts: 'Contacts', 
        reports: 'Reports', 
        security: 'Security' 
    };
    document.getElementById('pageTitle').innerHTML = `<i class="fas ${getPageIcon(page)}"></i> ${titles[page] || page}`;
    renderCurrentPage();
}

function getPageIcon(page) {
    const icons = { 
        dashboard: 'fa-tachometer-alt', 
        myactivities: 'fa-list', 
        activities: 'fa-tasks', 
        members: 'fa-users', 
        payments: 'fa-money-bill-wave', 
        paymentsummary: 'fa-chart-pie',
        contacts: 'fa-address-book', 
        reports: 'fa-chart-bar', 
        security: 'fa-shield-alt' 
    };
    return icons[page] || 'fa-folder';
}

function toggleSidebar() { 
    toggleMobileSidebar(); 
}

// ============================================
// AUTHENTICATION
// ============================================
function selectRole(role) {
    _selectedRole = role;
    const adminBtn = document.getElementById('adminRoleBtn');
    const userBtn = document.getElementById('userRoleBtn');
    if (adminBtn) adminBtn.style.borderColor = role === 'admin' ? '#ff862d' : '#e0e0e0';
    if (userBtn) userBtn.style.borderColor = role === 'user' ? '#ff862d' : '#e0e0e0';
    
    const adminPwdDiv = document.getElementById('adminPasswordDiv');
    const userSelectDiv = document.getElementById('userSelectDiv');
    if (adminPwdDiv) adminPwdDiv.style.display = role === 'admin' ? 'block' : 'none';
    if (userSelectDiv) userSelectDiv.style.display = role === 'user' ? 'block' : 'none';
}

async function confirmLogin() {
    let storedPwd = localStorage.getItem('admin_password');
    if (!storedPwd) {
        try {
            const { data: adminSetting } = await _supabase
                .from('admin_settings')
                .select('setting_value')
                .eq('setting_key', 'admin_password')
                .single();
            storedPwd = adminSetting?.setting_value || 'admin123';
        } catch (error) { 
            storedPwd = 'admin123'; 
        }
    }
    
    if (_selectedRole === 'admin') {
        const pwd = document.getElementById('adminPassword').value;
        if (pwd === storedPwd) {
            _currentRole = 'admin';
            _currentUser = { id: 0, name: 'Administrator' };
            showAdminDashboard();
        } else {
            Swal.fire('Error', 'Invalid password!', 'error');
        }
    } else if (_selectedRole === 'user') {
        const userId = parseInt(document.getElementById('userSelect').value);
        if (!userId) { 
            Swal.fire('Error', 'Please select your name', 'error'); 
            return; 
        }
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
    document.getElementById('myActivitiesNav').style.display = 'none';
    document.getElementById('activitiesNav').style.display = 'flex';
    document.getElementById('membersNav').style.display = 'flex';
    document.getElementById('paymentsNav').style.display = 'flex';
    document.getElementById('paymentsSummaryNav').style.display = 'flex';
    document.getElementById('reportsNav').style.display = 'flex';
    document.getElementById('securityNav').style.display = 'flex';
    document.getElementById('notificationBell').style.display = 'flex';
    startOfflineSupport();
    
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
    document.getElementById('myActivitiesNav').style.display = 'flex';
    document.getElementById('activitiesNav').style.display = 'none';
    document.getElementById('membersNav').style.display = 'none';
    document.getElementById('paymentsNav').style.display = 'flex';
    document.getElementById('paymentsSummaryNav').style.display = 'none';
    document.getElementById('reportsNav').style.display = 'flex';
    document.getElementById('securityNav').style.display = 'none';
    document.getElementById('notificationBell').style.display = 'flex';
    _currentPage = 'dashboard';
    setupRealtimeNotifications();
    startOfflineSupport();
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
    const adminPwd = document.getElementById('adminPassword');
    const userSelect = document.getElementById('userSelect');
    if (adminPwd) adminPwd.value = '';
    if (userSelect) userSelect.value = '';
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
// NOTIFICATION SYSTEM
// ============================================
let notifications = [];
let notificationIdCounter = 0;

function loadNotifications() {
    const saved = localStorage.getItem('obunangwe_notifications');
    if (saved) {
        notifications = JSON.parse(saved);
        notificationIdCounter = notifications.length > 0 ? Math.max(...notifications.map(n => n.id)) + 1 : 0;
        updateNotificationBadge();
    }
}

function saveNotifications() {
    localStorage.setItem('obunangwe_notifications', JSON.stringify(notifications));
    updateNotificationBadge();
}

function updateNotificationBadge() {
    const unreadCount = notifications.filter(n => !n.read).length;
    const badge = document.getElementById('notificationCount');
    if (badge) { 
        badge.textContent = unreadCount; 
        badge.style.display = unreadCount > 0 ? 'flex' : 'none'; 
    }
}

function addNotification(title, message, type = 'info', relatedId = null) {
    const notification = { 
        id: notificationIdCounter++, 
        title, 
        message, 
        type, 
        timestamp: new Date().toISOString(), 
        read: false, 
        relatedId 
    };
    notifications.unshift(notification);
    if (notifications.length > 50) notifications.pop();
    saveNotifications();
    queueToast(title, message, type, 5000);
    return notification;
}

function openNotificationCenter() { 
    renderNotificationsList(); 
    document.getElementById('notificationModal').style.display = 'flex'; 
}

function renderNotificationsList() {
    const container = document.getElementById('notificationsList');
    if (!container) return;
    
    if (notifications.length === 0) { 
        container.innerHTML = '<p style="text-align:center;color:#999;">No notifications</p>'; 
        return; 
    }
    
    container.innerHTML = notifications.map(notif => {
        let icon = 'fa-info-circle';
        if (notif.type === 'success') icon = 'fa-check-circle';
        if (notif.type === 'warning') icon = 'fa-exclamation-triangle';
        if (notif.type === 'error') icon = 'fa-times-circle';
        
        return `
            <div class="notification-item ${notif.read ? '' : 'unread'}" onclick="markNotificationRead(${notif.id})">
                <div class="notification-icon ${notif.type}">
                    <i class="fas ${icon}"></i>
                </div>
                <div class="notification-content">
                    <div class="notification-title">${notif.title}</div>
                    <div class="notification-message">${notif.message}</div>
                    <div class="notification-date">${new Date(notif.timestamp).toLocaleString()}</div>
                </div>
            </div>
        `;
    }).join('');
}

function markNotificationRead(id) {
    const notif = notifications.find(n => n.id === id);
    if (notif) { 
        notif.read = true; 
        saveNotifications(); 
        renderNotificationsList(); 
    }
}

function markAllNotificationsRead() { 
    notifications.forEach(n => n.read = true); 
    saveNotifications(); 
    renderNotificationsList(); 
}

loadNotifications();

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

// Add Member Form Submit Handler
const addMemberForm = document.getElementById('addMemberForm');
if (addMemberForm) {
    const newForm = addMemberForm.cloneNode(true);
    addMemberForm.parentNode.replaceChild(newForm, addMemberForm);
    newForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        const submitBtn = newForm.querySelector('button[type="submit"]');
        const originalText = submitBtn.innerHTML;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-pulse"></i> Adding...';
        submitBtn.disabled = true;
        
        try {
            const memberType = document.getElementById('memberType').value;
            const boardPosition = document.getElementById('memberBoardPosition').value;
            const parentId = document.getElementById('memberParentId').value;
            
            const result = await addMember(
                document.getElementById('memberName').value,
                document.getElementById('memberRole')?.value || (memberType === 'parent' ? 'parent' : 'child'),
                document.getElementById('memberPhone').value,
                document.getElementById('memberEmail').value,
                window._addImageBase64 || null,
                document.getElementById('memberDob').value,
                document.getElementById('memberBloodGroup').value,
                document.getElementById('memberAllergies').value,
                document.getElementById('memberEmergencyContact').value,
                document.getElementById('memberOccupation').value,
                document.getElementById('memberLocation').value,
                document.getElementById('memberMaritalStatus').value,
                document.getElementById('memberAnniversary').value,
                document.getElementById('memberBio').value,
                document.getElementById('memberFavoriteColor').value,
                memberType,
                boardPosition,
                parentId
            );
            
            if (result) {
                closeModal('addMemberModal');
                newForm.reset();
                const preview = document.getElementById('addImagePreview');
                if (preview) preview.innerHTML = '<i class="fas fa-camera"></i><span>Add Photo</span>';
                window._addImageFile || null
                await renderCurrentPage();
                queueToast('✅ Member Added', 'New family member has been added successfully.', 'success', 3000);
            }
        } catch (error) {
            console.error('Error adding member:', error);
            Swal.fire('Error', 'Failed to add member. Please try again.', 'error');
        } finally {
            submitBtn.innerHTML = originalText;
            submitBtn.disabled = false;
        }
    });
}

// Edit Member Form Submit Handler
const editMemberForm = document.getElementById('editMemberForm');
if (editMemberForm) {
    const newEditForm = editMemberForm.cloneNode(true);
    editMemberForm.parentNode.replaceChild(newEditForm, editMemberForm);
    newEditForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        const submitBtn = newEditForm.querySelector('button[type="submit"]');
        const originalText = submitBtn.innerHTML;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-pulse"></i> Updating...';
        submitBtn.disabled = true;
        
        try {
            const memberType = document.getElementById('editMemberType').value;
            const boardPosition = document.getElementById('editMemberBoardPosition').value;
            let parentId = document.getElementById('editMemberParentId').value;
            
            // CRITICAL: Convert empty string to null
            if (parentId === '' || parentId === 'null' || parentId === 'undefined') {
                parentId = null;
            }
            
            // If member is board or parent, parentId should be null
            if (memberType === 'board' || memberType === 'parent') {
                parentId = null;
            }
            
            const result = await updateMember(
                parseInt(document.getElementById('editMemberId').value),
                document.getElementById('editMemberName').value,
                document.getElementById('editMemberRole')?.value || (memberType === 'parent' ? 'parent' : 'child'),
                document.getElementById('editMemberPhone').value,
                document.getElementById('editMemberEmail').value,
                window._editImageFile || null,
                document.getElementById('editMemberDob').value,
                document.getElementById('editMemberBloodGroup').value,
                document.getElementById('editMemberAllergies').value,
                document.getElementById('editMemberEmergencyContact').value,
                document.getElementById('editMemberOccupation').value,
                document.getElementById('editMemberLocation').value,
                document.getElementById('editMemberMaritalStatus').value,
                document.getElementById('editMemberAnniversary').value,
                document.getElementById('editMemberBio').value,
                document.getElementById('editMemberFavoriteColor').value,
                memberType,
                boardPosition,
                parentId  // This will be null for board/parent members
            );
            
            if (result) {
                closeModal('editMemberModal');
                await renderCurrentPage();
                Swal.fire('Success!', 'Member updated successfully', 'success');
            }
        } catch (error) {
            console.error('Error updating member:', error);
            
            // Close modal first
            closeModal('editMemberModal');
            
            // Show error in front
            setTimeout(() => {
                Swal.fire({
                    title: 'Error!',
                    text: error.message || 'Failed to update member. Please check your input.',
                    icon: 'error',
                    confirmButtonText: 'OK',
                    confirmButtonColor: '#e74c3c'
                });
            }, 100);
        } finally {
            submitBtn.innerHTML = originalText;
            submitBtn.disabled = false;
        }
    });
}

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

// Initialize birthday checker
setInterval(checkBirthdays, 86400000);

// ============================================
// OFFLINE SUPPORT FUNCTIONS
// ============================================

let isOnline = navigator.onLine;
let pendingOperations = [];

// Check online status
function updateOnlineStatus() {
    isOnline = navigator.onLine;
    
    if (isOnline) {
        console.log('Back online - syncing data...');
        syncPendingOperations();
        showOnlineStatus('Back Online! Syncing data...', 'success');
    } else {
        console.log('Offline mode');
        showOnlineStatus('You are offline. Changes will sync when online.', 'warning');
    }
}

// Show online/offline status
function showOnlineStatus(message, type) {
    let statusBar = document.getElementById('onlineStatus');
    if (!statusBar) {
        statusBar = document.createElement('div');
        statusBar.id = 'onlineStatus';
        statusBar.className = 'online-status';
        document.body.appendChild(statusBar);
    }
    
    statusBar.textContent = message;
    statusBar.className = `online-status ${type}`;
    statusBar.style.display = 'block';
    
    setTimeout(() => {
        statusBar.style.display = 'none';
    }, 3000);
}

// Save operation for offline sync
function saveOfflineOperation(operation, data) {
    pendingOperations.push({
        id: Date.now(),
        operation: operation,
        data: data,
        timestamp: new Date().toISOString()
    });
    
    localStorage.setItem('pendingOperations', JSON.stringify(pendingOperations));
    showOnlineStatus('Saved offline. Will sync when online.', 'info');
}

// Sync pending operations when back online
async function syncPendingOperations() {
    const saved = localStorage.getItem('pendingOperations');
    if (!saved) return;
    
    pendingOperations = JSON.parse(saved);
    
    if (pendingOperations.length === 0) return;
    
    showOnlineStatus(`Syncing ${pendingOperations.length} pending operations...`, 'info');
    
    for (const op of pendingOperations) {
        try {
            if (op.operation === 'payment') {
                await _supabase.from('payments').insert(op.data);
            } else if (op.operation === 'activity') {
                await _supabase.from('activities').insert(op.data);
            }
            pendingOperations = pendingOperations.filter(p => p.id !== op.id);
        } catch (error) {
            console.error('Sync failed for operation:', op, error);
        }
    }
    
    localStorage.setItem('pendingOperations', JSON.stringify(pendingOperations));
    
    if (pendingOperations.length === 0) {
        showOnlineStatus('All data synced successfully!', 'success');
        await loadData();
        await renderCurrentPage();
    }
}

// Enhanced recordPayment with offline support
async function recordPaymentOffline(activityId, memberId, amount, date, notes) {
    if (!isOnline) {
        saveOfflineOperation('payment', {
            activity_id: activityId,
            member_id: memberId,
            amount: parseFloat(amount),
            payment_date: date,
            notes: notes
        });
        
        Swal.fire({
            title: 'Saved Offline',
            text: 'You are offline. This payment will be saved and synced when you reconnect.',
            icon: 'info',
            confirmButtonText: 'OK'
        });
        return true;
    }
    
    return await recordPayment(activityId, memberId, amount, date, notes);
}

// Cache data for offline use
async function cacheOfflineData() {
    if (!isOnline) return;
    
    try {
        const cache = await caches.open('obunangwe-data-v1');
        
        const activities = _activities;
        const members = _familyMembers;
        
        await cache.put('/api/activities', new Response(JSON.stringify(activities)));
        await cache.put('/api/members', new Response(JSON.stringify(members)));
        
        console.log('Offline data cached');
    } catch (error) {
        console.error('Cache failed:', error);
    }
}

// Load cached data when offline
async function loadCachedData() {
    if (isOnline) return;
    
    try {
        const cache = await caches.open('obunangwe-data-v1');
        
        const cachedActivities = await cache.match('/api/activities');
        const cachedMembers = await cache.match('/api/members');
        
        if (cachedActivities) {
            const activities = await cachedActivities.json();
            _activities = activities;
            console.log('Loaded activities from cache');
        }
        
        if (cachedMembers) {
            const members = await cachedMembers.json();
            _familyMembers = members;
            console.log('Loaded members from cache');
        }
        
        await renderCurrentPage();
        showOnlineStatus('Showing cached data. Connect to internet for updates.', 'warning');
    } catch (error) {
        console.error('Failed to load cached data:', error);
    }
}

// Initialize offline support
function initOfflineSupport() {
    updateOnlineStatus();
    
    // Show offline banner
    function showOfflineBanner() {
        let banner = document.getElementById('offlineBanner');
        if (!isOnline) {
            if (!banner) {
                banner = document.createElement('div');
                banner.id = 'offlineBanner';
                banner.innerHTML = `
                    <div style="background: #f39c12; color: white; text-align: center; padding: 8px; font-size: 12px; position: fixed; bottom: 0; left: 0; right: 0; z-index: 10000;">
                        <i class="fas fa-wifi-slash"></i> You are offline. Changes will be saved and synced when online.
                    </div>
                `;
                document.body.appendChild(banner);
            }
        } else {
            if (banner) banner.remove();
        }
    }
    
    showOfflineBanner();
    
    // Register service worker for offline support
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js')
            .then(registration => {
                console.log('Service Worker registered with scope:', registration.scope);
            })
            .catch(error => {
                console.error('Service Worker registration failed:', error);
            });
    }
    
    // Periodically check online status
    setInterval(() => {
        if (isOnline !== navigator.onLine) {
            updateOnlineStatus();
            showOfflineBanner();
            if (isOnline) {
                loadCachedData();
            }
        }
    }, 3000);
    
    // Cache data every 5 minutes when online
    setInterval(() => {
        if (isOnline) {
            cacheOfflineData();
        }
    }, 300000);
}

// Add event listeners for online/offline
window.addEventListener('online', () => {
    isOnline = true;
    updateOnlineStatus();
    syncPendingOperations();
    loadData();
});

window.addEventListener('offline', () => {
    isOnline = false;
    updateOnlineStatus();
    loadCachedData();
});

// Call this after login
function startOfflineSupport() {
    initOfflineSupport();
    loadCachedData();
}

// Request notification permission
async function requestNotificationPermission() {
    if ('Notification' in window) {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
            console.log('Notification permission granted');
        }
    }
}

// Check if app is installed as PWA
function isPWAInstalled() {
    return window.matchMedia('(display-mode: standalone)').matches || 
           window.navigator.standalone === true;
}

// Update startOfflineSupport call in showAdminDashboard and showUserDashboard
// Add this line at the end of both functions:
// startOfflineSupport();

// ============================================
// EXPOSE GLOBAL FUNCTIONS
// ============================================
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
window.deletePayment = deletePayment;
window.sendWhatsApp = sendWhatsApp;
window.makeCall = makeCall;
window.sendSMS = sendSMS;
window.generateShareableReport = generateShareableReport;
window.sendWhatsAppToAll = sendWhatsAppToAll;
window.changePassword = changePassword;
window.showActivityDetails = showActivityDetails;
window.showMemberDetails = showMemberDetails;
window.openAdjustmentModal = openAdjustmentModal;
window.closeToast = closeToast;
window.openNotificationCenter = openNotificationCenter;
window.markAllNotificationsRead = markAllNotificationsRead;
window.previewAddImage = previewAddImage;
window.previewEditImage = previewEditImage;
window.toggleMemberTypeFields = toggleMemberTypeFields;
window.toggleEditMemberTypeFields = toggleEditMemberTypeFields;