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
let _memberPositions = [];  // ADD THIS LINE


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
    // Load positions first
    await loadMemberPositions();
    
    // Load members
    const { data: members } = await _supabase.from('family_members').select('*');
    if (members) _familyMembers = members;
    
    // Load activities
    const { data: acts } = await _supabase.from('activities').select('*');
    if (acts) {
        _activities = [];
        for (const act of acts) {
            const { data: memberActs } = await _supabase
                .from('member_activities')
                .select('*, family_members(*)')
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
    
    // Populate user select dropdown for login
    const select = document.getElementById('userSelect');
    if (select && _familyMembers.length) {
        select.innerHTML = '<option value="">Select your name...</option>' + 
            _familyMembers.map(m => `<option value="${m.id}">${m.name}</option>`).join('');
    }
    
    // Populate position dropdowns if modals are open or will be opened
    if (document.getElementById('addMemberModal') && document.getElementById('addMemberModal').style.display === 'flex') {
        await populatePositionDropdowns();
    }
}

// ============================================
// IMAGE PREVIEW FUNCTIONS
// ============================================
function previewAddImage(input) {
    console.log('📷 previewAddImage called');
    console.log('Input files:', input.files);
    
    if (input.files && input.files[0]) {
        const file = input.files[0];
        console.log('File selected:', file.name, file.type, file.size);
        
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if (!allowedTypes.includes(file.type)) {
            Swal.fire('Error', 'Please upload a valid image', 'error');
            input.value = '';
            return;
        }
        
        if (file.size > 5 * 1024 * 1024) {
            Swal.fire('Error', 'Image size must be less than 5MB', 'error');
            input.value = '';
            return;
        }
        
        const reader = new FileReader();
        reader.onload = function(e) {
            const preview = document.getElementById('addImagePreview');
            if (preview) {
                preview.innerHTML = `<img src="${e.target.result}" alt="Preview" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
            }
            // Store the file globally
            window._currentImageFile = file;
            console.log('✅ Image preview ready, file stored:', file.name);
        };
        reader.readAsDataURL(file);
    } else {
        console.log('No file selected');
        window._currentImageFile = null;
    }
}
function previewEditImage(input) {
    if (input.files && input.files[0]) {
        const file = input.files[0];
        
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if (!allowedTypes.includes(file.type)) {
            Swal.fire('Error', 'Please upload a valid image (JPEG, PNG, GIF, or WEBP)', 'error');
            input.value = '';
            return;
        }
        
        if (file.size > 5 * 1024 * 1024) {
            Swal.fire('Error', 'Image size must be less than 5MB', 'error');
            input.value = '';
            return;
        }
        
        const reader = new FileReader();
        reader.onload = function(e) {
            const preview = document.getElementById('editImagePreview');
            preview.innerHTML = `<img src="${e.target.result}" alt="Preview" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
            window._editImageFile = file;
        };
        reader.readAsDataURL(file);
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
async function openAdjustmentModal(activityId, memberId = null) {
    const activity = _activities.find(a => a.id === activityId);
    if (!activity) return;
    
    const members = await getFamilyMembers();
    const memberActivities = activity.memberPayments || [];
    
    // If memberId is provided, we're adjusting for a single member
    // Otherwise, we can select multiple members
    const isSingleMember = memberId !== null;
    
    let memberSelectHtml = '';
    if (!isSingleMember) {
        // Build member selection checkboxes
        memberSelectHtml = `
            <div class="form-group">
                <label>Select Members to Adjust</label>
                <div style="max-height: 200px; overflow-y: auto; border: 1px solid #ddd; border-radius: 8px; padding: 10px;">
                    ${members.map(m => {
                        const memberActivity = memberActivities.find(ma => ma.member_id === m.id);
                        const balance = (memberActivity?.amount_owed || 0) - (memberActivity?.amount_paid || 0);
                        if (balance <= 0 && memberActivity?.status !== 'exempt') return ''; // Skip settled members
                        return `
                            <label style="display: flex; align-items: center; padding: 8px; margin: 0; cursor: pointer; border-bottom: 1px solid #f0f0f0;">
                                <input type="checkbox" class="member-select-checkbox" value="${m.id}" style="margin-right: 12px;">
                                <div style="flex: 1;">
                                    <strong>${m.name}</strong>
                                    <span style="font-size: 11px; color: #666; margin-left: 8px;">${m.member_type}</span>
                                    <div style="font-size: 11px;">
                                        Owed: UGX ${(memberActivity?.amount_owed || 0).toLocaleString()} | 
                                        Paid: UGX ${(memberActivity?.amount_paid || 0).toLocaleString()} | 
                                        Balance: UGX ${balance.toLocaleString()}
                                    </div>
                                </div>
                            </label>
                        `;
                    }).join('')}
                </div>
                <div style="margin-top: 8px;">
                    <button type="button" class="btn-edit" onclick="selectAllMembers()" style="margin-right: 5px; padding: 4px 8px;">Select All</button>
                    <button type="button" class="btn-edit" onclick="deselectAllMembers()" style="padding: 4px 8px;">Deselect All</button>
                </div>
            </div>
        `;
    }
    
    // Get the member name if single member
    let memberName = '';
    let currentBalance = 0;
    if (isSingleMember) {
        const member = members.find(m => m.id === memberId);
        const memberActivity = memberActivities.find(ma => ma.member_id === memberId);
        memberName = member?.name || 'Unknown';
        currentBalance = (memberActivity?.amount_owed || 0) - (memberActivity?.amount_paid || 0);
    }
    
    const result = await Swal.fire({
        title: isSingleMember ? `Adjust Payment for ${memberName}` : 'Adjust Payments - Select Members',
        html: `
            <div style="text-align: left;">
                <div style="background: var(--primary-light); padding: 12px; border-radius: 8px; margin-bottom: 15px;">
                    <p style="margin: 0;"><strong>Activity:</strong> ${activity.name}</p>
                    <p style="margin: 5px 0 0;"><strong>Total Budget:</strong> UGX ${activity.totalBudget.toLocaleString()}</p>
                    ${isSingleMember ? `<p style="margin: 5px 0 0;"><strong>Current Balance:</strong> UGX ${currentBalance.toLocaleString()}</p>` : ''}
                </div>
                
                ${memberSelectHtml}
                
                <div class="form-group" style="margin-top: 15px;">
                    <label>Adjustment Amount (UGX)</label>
                    <input type="number" id="adjustmentAmount" class="swal2-input" placeholder="Enter adjustment amount" style="width: 100%;">
                </div>
                
                <div class="form-group">
                    <label>Adjustment Type</label>
                    <select id="adjustmentType" class="swal2-select" style="width: 100%;" onchange="toggleAdjustmentReasonRequired()">
                        <option value="increase">Increase Amount Owed (+)</option>
                        <option value="decrease">Decrease Amount Owed (-)</option>
                        <option value="waive">Waive/Remove Amount (Set to zero)</option>
                        <option value="discount">Apply Discount (%)</option>
                        <option value="penalty">Add Penalty (%)</option>
                    </select>
                </div>
                
                <div class="form-group" id="percentageDiv" style="display: none;">
                    <label>Percentage (%)</label>
                    <input type="number" id="adjustmentPercentage" class="swal2-input" placeholder="Enter percentage" style="width: 100%;">
                </div>
                
                <div class="form-group">
                    <label>Reason for Adjustment</label>
                    <textarea id="adjustmentReason" class="swal2-textarea" rows="3" placeholder="e.g., Special consideration, discount, penalty, correction..."></textarea>
                </div>
            </div>
        `,
        focusConfirm: false,
        preConfirm: () => {
            const amount = parseFloat(document.getElementById('adjustmentAmount')?.value);
            const type = document.getElementById('adjustmentType')?.value;
            const reason = document.getElementById('adjustmentReason')?.value;
            const percentage = parseFloat(document.getElementById('adjustmentPercentage')?.value);
            
            // Get selected members
            let selectedMembers = [];
            if (isSingleMember) {
                selectedMembers = [memberId];
            } else {
                const checkboxes = document.querySelectorAll('.member-select-checkbox:checked');
                selectedMembers = Array.from(checkboxes).map(cb => parseInt(cb.value));
            }
            
            if (selectedMembers.length === 0) {
                Swal.showValidationMessage('Please select at least one member');
                return false;
            }
            
            if (type !== 'discount' && type !== 'penalty') {
                if (isNaN(amount) || amount <= 0) {
                    Swal.showValidationMessage('Please enter a valid amount');
                    return false;
                }
            }
            
            if (type === 'discount' || type === 'penalty') {
                if (isNaN(percentage) || percentage <= 0 || percentage > 100) {
                    Swal.showValidationMessage('Please enter a valid percentage (1-100)');
                    return false;
                }
            }
            
            if (!reason) {
                Swal.showValidationMessage('Please provide a reason for the adjustment');
                return false;
            }
            
            return { 
                selectedMembers, 
                amount, 
                type, 
                reason,
                percentage,
                isSingleMember 
            };
        },
        showCancelButton: true,
        confirmButtonText: 'Apply Adjustment',
        cancelButtonText: 'Cancel',
        width: '600px'
    });
    
    if (result.isConfirmed) {
        // Apply adjustment to all selected members
        for (const memberId of result.value.selectedMembers) {
            await applyAdjustment(
                activityId, 
                memberId, 
                result.value.amount, 
                result.value.type, 
                result.value.reason,
                result.value.percentage
            );
        }
        
        // Show summary
        const count = result.value.selectedMembers.length;
        Swal.fire({
            title: 'Adjustments Applied',
            text: `Adjustment applied to ${count} member(s) successfully.`,
            icon: 'success',
            timer: 2000,
            showConfirmButton: false
        });
        
        await loadData();
        await renderCurrentPage();
    }
}

// Toggle percentage input visibility
function toggleAdjustmentReasonRequired() {
    const type = document.getElementById('adjustmentType')?.value;
    const percentageDiv = document.getElementById('percentageDiv');
    
    if (type === 'discount' || type === 'penalty') {
        if (percentageDiv) percentageDiv.style.display = 'block';
    } else {
        if (percentageDiv) percentageDiv.style.display = 'none';
    }
}

// Select all members
function selectAllMembers() {
    const checkboxes = document.querySelectorAll('.member-select-checkbox');
    checkboxes.forEach(cb => cb.checked = true);
}

// Deselect all members
function deselectAllMembers() {
    const checkboxes = document.querySelectorAll('.member-select-checkbox');
    checkboxes.forEach(cb => cb.checked = false);
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

async function addMember(name, role, phone, email, profileImageFile, dob, bloodGroup, allergies, 
    emergencyContact, occupation, location, maritalStatus, anniversary, bio, favoriteColor,
    positionId, boardPosition, parentId) {
    
    console.log('========== ADD MEMBER START ==========');
    console.log('📝 Name:', name);
    console.log('📌 Position ID:', positionId);
    console.log('📷 Profile image:', profileImageFile ? profileImageFile.name : 'No image');
    console.log('👨‍👩 Parent ID:', parentId);
    console.log('🏛️ Board Position:', boardPosition);
    
    if (_currentRole !== 'admin') { 
        Swal.fire('Access Denied', 'Only administrators can add members', 'error'); 
        return false; 
    }
    
    // Validate required fields
    if (!name) {
        Swal.fire('Error', 'Name is required', 'error');
        return false;
    }
    
    if (!positionId || positionId === '') {
        Swal.fire('Error', 'Please select a position/role', 'error');
        return false;
    }
    
    try {
        // Get position details
        let selectedPosition = null;
        if (_memberPositions && _memberPositions.length > 0) {
            selectedPosition = _memberPositions.find(p => p.id === parseInt(positionId));
        }
        
        // If positions not loaded, fetch them
        if (!selectedPosition) {
            console.log('Positions not loaded, fetching...');
            const { data: positionsData } = await _supabase
                .from('member_positions')
                .select('*')
                .eq('id', parseInt(positionId))
                .single();
            selectedPosition = positionsData;
        }
        
        if (!selectedPosition) {
            console.error('Position not found for ID:', positionId);
            Swal.fire('Error', 'Selected position not found', 'error');
            return false;
        }
        
        console.log('✅ Position found:', selectedPosition.position_name);
        
        // Determine member type from position category
        const memberType = selectedPosition.category;
        const canPay = selectedPosition.can_pay;
        const paysMultiplier = selectedPosition.pays_multiplier;
        
        console.log('Member type:', memberType, 'Can pay:', canPay, 'Multiplier:', paysMultiplier);
        
        // Determine payment responsible
        let paymentResponsibleId = null;
        if (memberType === 'dependent' && parentId && parentId !== '') {
            paymentResponsibleId = parseInt(parentId);
        }
        
        // Prepare insert data
        const insertData = { 
            name: name,
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
            position_id: parseInt(positionId),
            parent_id: parentId ? parseInt(parentId) : null,
            payment_responsible_id: paymentResponsibleId,
            is_board_member: memberType === 'board',
            board_position: boardPosition || null,
            can_approve_payments: memberType === 'board',
            can_pay: canPay,
            pays_multiplier: paysMultiplier
        };
        
        console.log('Inserting member with data:', insertData);
        
        // Insert member WITHOUT profile picture first
        const { data: member, error } = await _supabase
            .from('family_members')
            .insert(insertData)
            .select();
        
        if (error) { 
            console.error('❌ Insert error:', error);
            Swal.fire('Error', error.message, 'error'); 
            return false; 
        }
        
        if (!member || member.length === 0) {
            console.error('No member returned after insert');
            Swal.fire('Error', 'Failed to create member record', 'error');
            return false;
        }
        
        const memberId = member[0].id;
        console.log('✅ Member created with ID:', memberId);
        
        // Upload profile picture if provided
        if (profileImageFile) {
            console.log('📤 Uploading profile picture...');
            
            const fileExt = profileImageFile.name.split('.').pop();
            const fileName = `${memberId}-${Date.now()}.${fileExt}`;
            
            const { data: uploadData, error: uploadError } = await _supabase.storage
                .from('profile-pictures')
                .upload(fileName, profileImageFile, {
                    cacheControl: '3600',
                    upsert: true
                });
            
            if (uploadError) {
                console.error('❌ Upload error:', uploadError);
                // Don't fail the whole operation, just warn
                Swal.fire('Warning', 'Member added but profile picture upload failed', 'warning');
            } else {
                console.log('✅ Upload successful');
                const profilePictureUrl = `${SUPABASE_URL}/storage/v1/object/public/profile-pictures/${fileName}`;
                
                // Update member with profile picture URL
                const { error: updateError } = await _supabase
                    .from('family_members')
                    .update({ profile_picture: profilePictureUrl })
                    .eq('id', memberId);
                
                if (updateError) {
                    console.error('❌ Update error:', updateError);
                } else {
                    console.log('✅ Member updated with profile picture');
                }
            }
        }
        
        // Recalculate all active activity shares
        const activeActivities = _activities.filter(a => a.status === 'active');
        for (const activity of activeActivities) {
            await recalculateActivityShares(activity.id, activity.totalBudget);
        }
        
        await loadData();
        console.log('========== ADD MEMBER SUCCESS ==========');
        Swal.fire('Success!', `${name} added to family as ${selectedPosition.position_name}.`, 'success');
        return true;
        
    } catch (err) {
        console.error('❌ Unexpected error in addMember:', err);
        Swal.fire('Error', 'An unexpected error occurred: ' + err.message, 'error');
        return false;
    }
}

async function updateMember(id, name, role, phone, email, profileImageFile, dob, bloodGroup, allergies, 
    emergencyContact, occupation, location, maritalStatus, anniversary, bio, favoriteColor,
    positionId, boardPosition, parentId) {
    
    console.log('✏️ Updating member:', name);
    console.log('📷 Has new image?', profileImageFile ? `Yes - ${profileImageFile.name}` : 'No');
    console.log('📌 New Position ID:', positionId);
    
    if (_currentRole !== 'admin') { 
        Swal.fire('Access Denied', 'Only administrators can edit members', 'error'); 
        return false; 
    }
    
    // Get current member data
    const currentMember = _familyMembers.find(m => m.id === id);
    if (!currentMember) {
        Swal.fire('Error', 'Member not found', 'error');
        return false;
    }
    
    // Get position details
    const positions = await getMemberPositions();
    const selectedPosition = positions.find(p => p.id === parseInt(positionId));
    
    if (!selectedPosition) {
        Swal.fire('Error', 'Please select a valid position', 'error');
        return false;
    }
    
    // Determine member type from position category
    const memberType = selectedPosition.category;
    const canPay = selectedPosition.can_pay;
    const paysMultiplier = selectedPosition.pays_multiplier;
    
    // Determine payment responsible
    let paymentResponsibleId = null;
    if (memberType === 'dependent' && parentId) {
        paymentResponsibleId = parentId;
    }
    
    let profilePictureUrl = currentMember.profile_picture;
    
    // Upload new profile picture if provided
    if (profileImageFile) {
        console.log('📤 Processing new profile picture...');
        
        // Delete old profile picture from storage if it exists
        if (currentMember.profile_picture && currentMember.profile_picture.includes('storage')) {
            const oldFileName = currentMember.profile_picture.split('/').pop();
            console.log('🗑️ Deleting old file:', oldFileName);
            
            const { error: deleteError } = await _supabase.storage
                .from('profile-pictures')
                .remove([oldFileName]);
            
            if (deleteError) {
                console.log('Could not delete old image:', deleteError.message);
            } else {
                console.log('✅ Old image deleted');
            }
        }
        
        // Upload new image
        const fileExt = profileImageFile.name.split('.').pop();
        const fileName = `${id}-${Date.now()}.${fileExt}`;
        
        const { data: uploadData, error: uploadError } = await _supabase.storage
            .from('profile-pictures')
            .upload(fileName, profileImageFile, {
                cacheControl: '3600',
                upsert: true
            });
        
        if (uploadError) {
            console.error('❌ Upload error:', uploadError);
            Swal.fire('Warning', 'Profile picture upload failed, but other info will be updated.', 'warning');
        } else {
            console.log('✅ Upload successful:', uploadData);
            profilePictureUrl = `${SUPABASE_URL}/storage/v1/object/public/profile-pictures/${fileName}`;
            console.log('🔗 New profile picture URL:', profilePictureUrl);
        }
    }
    
    // Update member in database
    const { data: updatedMember, error: updateError } = await _supabase
        .from('family_members')
        .update({ 
            name, 
            role: (memberType === 'board' || memberType === 'parent') ? 'parent' : 'child',
            phone, 
            email,
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
            position_id: positionId,
            parent_id: parentId || null,
            payment_responsible_id: paymentResponsibleId,
            is_board_member: memberType === 'board',
            board_position: boardPosition || null,
            can_approve_payments: memberType === 'board',
            can_pay: canPay,
            pays_multiplier: paysMultiplier,
            profile_picture: profilePictureUrl
        })
        .eq('id', id)
        .select();
    
    if (updateError) { 
        console.error('❌ Update error:', updateError);
        Swal.fire('Error', updateError.message, 'error'); 
        return false; 
    }
    
    console.log('✅ Member updated successfully:', updatedMember);
    
    // Recalculate all active activity shares
    const activeActivities = _activities.filter(a => a.status === 'active');
    for (const activity of activeActivities) {
        await recalculateActivityShares(activity.id, activity.totalBudget);
    }
    
    await loadData();
    Swal.fire('Success!', `${name} updated successfully as ${selectedPosition.position_name}.`, 'success');
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
// NEW FUNCTIONS TO ADD - STORAGE UPLOAD
// ============================================

async function uploadProfilePicture(file, memberId) {
    if (!file) {
        console.log('❌ No file provided');
        return null;
    }
    
    console.log('📤 Starting upload:', file.name, file.type, file.size);
    
    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
        Swal.fire('Error', 'Please upload a valid image (JPEG, PNG, GIF, or WEBP)', 'error');
        return null;
    }
    
    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
        Swal.fire('Error', 'Image size must be less than 5MB', 'error');
        return null;
    }
    
    const fileExt = file.name.split('.').pop();
    const fileName = `${memberId}-${Date.now()}.${fileExt}`;
    const filePath = fileName;
    
    console.log('📁 Upload path:', filePath);
    
    try {
        // Upload to Supabase Storage
        const { data, error } = await _supabase.storage
            .from('profile-pictures')
            .upload(filePath, file, {
                cacheControl: '3600',
                upsert: true,
                contentType: file.type
            });
        
        if (error) {
            console.error('❌ Storage upload error:', error);
            Swal.fire('Upload Error', error.message, 'error');
            return null;
        }
        
        console.log('✅ Upload successful:', data);
        
        // Get public URL
        const { data: publicUrlData } = _supabase.storage
            .from('profile-pictures')
            .getPublicUrl(filePath);
        
        console.log('🔗 Public URL:', publicUrlData.publicUrl);
        return publicUrlData.publicUrl;
        
    } catch (err) {
        console.error('❌ Upload exception:', err);
        Swal.fire('Error', 'Failed to upload image: ' + err.message, 'error');
        return null;
    }
}

async function deleteOldProfilePicture(memberId, oldImageUrl) {
    if (!oldImageUrl) return;
    
    const fileName = oldImageUrl.split('/').pop();
    if (!fileName || !fileName.includes(memberId.toString())) return;
    
    await _supabase.storage
        .from('profile-pictures')
        .remove([fileName]);
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
    
    // Get payment stats for all members
    const memberStats = [];
    for (const m of members) {
        const stats = await getUserStatistics(m.id);
        memberStats.push({ ...m, stats });
    }
    
    // Sort: Board members first, then parents, then regular, then dependents
    memberStats.sort((a, b) => {
        const order = { board: 1, parent: 2, regular: 3, dependent: 4 };
        return (order[a.member_type] || 5) - (order[b.member_type] || 5);
    });
    
    // Get positions for label display
    const positions = await getMemberPositions();
    
    let tableHtml = `
        <div class="card">
            <h2>All Family Members 
                <button class="btn-primary" onclick="openAddModal()">
                    <i class="fas fa-plus"></i> Add Member
                </button>
            </h2>
            <div class="members-table-container" style="overflow-x: auto;">
                <table class="members-table" style="width: 100%; min-width: 800px;">
                    <thead>
                        <tr>
                            <th>Photo</th>
                            <th>Name</th>
                            <th>Position/Role</th>
                            <th>Member Type</th>
                            <th>Contact</th>
                            <th>Medical</th>
                            <th>Location</th>
                            <th>Total Owed (UGX)</th>
                            <th>Total Paid (UGX)</th>
                            <th>Balance (UGX)</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
    `;
    
    for (const m of memberStats) {
        // Get position name
        const position = positions.find(p => p.id === m.position_id);
        const positionName = position ? position.position_name : (m.member_type || 'Unknown');
        
        // Determine member type badge
        let typeBadge = '';
        if (m.member_type === 'board') typeBadge = '<span class="member-type-badge board">🏛️ Board</span>';
        else if (m.member_type === 'parent') typeBadge = '<span class="member-type-badge parent">👨‍👩 Parent</span>';
        else if (m.member_type === 'regular') typeBadge = '<span class="member-type-badge regular">👤 Regular</span>';
        else if (m.member_type === 'dependent') typeBadge = '<span class="member-type-badge dependent">👶 Dependent</span>';
        else typeBadge = '<span class="member-type-badge">❓ Unknown</span>';
        
        // Responsible payer info
        let responsibleInfo = '';
        if (m.payment_responsible_id) {
            const responsible = members.find(r => r.id === m.payment_responsible_id);
            if (responsible) {
                responsibleInfo = `<div class="payment-responsible"><i class="fas fa-user-check"></i> Pays: ${responsible.name}</div>`;
            }
        }
        
        // Balance class
        const balance = m.stats.balance || 0;
        let balanceClass = '';
        let balanceText = `UGX ${balance.toLocaleString()}`;
        if (balance === 0) balanceClass = 'balance-zero';
        else if (balance > 0) balanceClass = 'balance-positive';
        else balanceClass = 'balance-negative';
        
        // Medical info
        let medicalHtml = '';
        if (m.blood_group) medicalHtml += `<span class="medical-badge-table"><i class="fas fa-tint"></i> ${m.blood_group}</span>`;
        if (m.allergies) medicalHtml += `<span class="medical-badge-table"><i class="fas fa-allergies"></i> Allergy</span>`;
        if (!medicalHtml) medicalHtml = '—';
        
        // Contact actions
        let contactHtml = '—';
        if (m.phone) {
            contactHtml = `
                <div class="contact-icons" onclick="event.stopPropagation()">
                    <button class="contact-icon-btn whatsapp" onclick="sendWhatsApp('${m.phone}', 'Hello from OBUNANGWE BULAIIRE!')" title="WhatsApp">
                        <i class="fab fa-whatsapp"></i>
                    </button>
                    <button class="contact-icon-btn call" onclick="makeCall('${m.phone}')" title="Call">
                        <i class="fas fa-phone"></i>
                    </button>
                </div>
            `;
        }
        
        // Action buttons
        const actionsHtml = `
            <div class="action-buttons" onclick="event.stopPropagation()">
                <button class="contact-icon-btn edit" onclick="openEditMember(${m.id})" title="Edit">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="contact-icon-btn delete" onclick="deleteMember(${m.id})" title="Delete">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `;
        
        // Profile picture
        let profileHtml = '';
        if (m.profile_picture) {
            profileHtml = `<img src="${m.profile_picture}" class="member-avatar-table" alt="${m.name}" onerror="this.src='https://placehold.co/40x40/01605a/white?text=📷'">`;
        } else {
            profileHtml = `<div class="member-avatar-placeholder"><i class="fas ${m.member_type === 'board' ? 'fa-crown' : (m.member_type === 'parent' ? 'fa-user-tie' : 'fa-user-child')}"></i></div>`;
        }
        
        tableHtml += `
            <tr onclick="showMemberDetails(${m.id})" style="cursor: pointer;">
                <td style="text-align: center;">${profileHtml}</td>
                <td class="member-name-cell">
                    <strong>${escapeHtml(m.name)}</strong>
                    ${responsibleInfo}
                </td>
                <td>
                    ${positionName}
                    ${m.board_position ? `<div><small>${m.board_position}</small></div>` : ''}
                </td>
                <td>${typeBadge}</td>
                <td>${contactHtml}</td>
                <td>${medicalHtml}</td>
                <td>${m.location ? `<i class="fas fa-map-marker-alt"></i> ${escapeHtml(m.location)}` : '—'}</td>
                <td class="balance-positive">UGX ${(m.stats.totalOwed || 0).toLocaleString()}</td>
                <td style="color: var(--success); font-weight: 600;">UGX ${(m.stats.totalPaid || 0).toLocaleString()}</td>
                <td class="${balanceClass}">${balanceText}</td>
                <td>${actionsHtml}</td>
            </tr>
        `;
    }
    
    tableHtml += `
                    </tbody>
                </table>
            </div>
        </div>
    `;
    
    // Add summary stats on top (optional)
    const totalMembers = memberStats.length;
    const payingMembers = memberStats.filter(m => m.can_pay !== false && m.member_type !== 'dependent').length;
    const totalOwedAll = memberStats.reduce((sum, m) => sum + (m.stats.totalOwed || 0), 0);
    const totalPaidAll = memberStats.reduce((sum, m) => sum + (m.stats.totalPaid || 0), 0);
    const totalBalanceAll = totalOwedAll - totalPaidAll;
    const completionRate = totalOwedAll > 0 ? ((totalPaidAll / totalOwedAll) * 100).toFixed(1) : 100;
    
    const summaryHtml = `
        <div class="stats-grid" style="margin-bottom: 20px;">
            <div class="stat-card"><div class="stat-number">${totalMembers}</div><h3>Total Members</h3></div>
            <div class="stat-card"><div class="stat-number">${payingMembers}</div><h3>Paying Members</h3></div>
            <div class="stat-card"><div class="stat-number">UGX ${totalOwedAll.toLocaleString()}</div><h3>Total Owed</h3></div>
            <div class="stat-card"><div class="stat-number">UGX ${totalPaidAll.toLocaleString()}</div><h3>Total Paid</h3></div>
            <div class="stat-card"><div class="stat-number">UGX ${totalBalanceAll.toLocaleString()}</div><h3>Total Balance</h3></div>
            <div class="stat-card"><div class="stat-number">${completionRate}%</div><h3>Completion Rate</h3></div>
        </div>
    `;
    
    document.getElementById('pageContent').innerHTML = summaryHtml + tableHtml;
}

// Helper function to escape HTML
function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    }).replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, function(c) {
        return c;
    });
}
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
                        
                        return `
                            <tr onclick="showMemberDetails(${m.id})">
                                <td>${m.profile_picture ? `<img src="${m.profile_picture}" class="member-avatar-table">` : `<div class="member-avatar-placeholder"><i class="fas ${m.member_type === 'board' ? 'fa-crown' : (m.member_type === 'parent' ? 'fa-user-tie' : 'fa-user-child')}"></i></div>`}</td>
                                <td class="member-name-cell">${m.name} ${isPayingForOthers ? '<span class="approval-badge">Pays for others</span>' : ''}</td>
                                <td>
                                    <span class="member-type-badge member-type-${m.member_type}">
                                        ${m.member_type === 'board' ? '🏛️ ' + (m.board_position || 'Board Member') : (m.member_type === 'parent' ? '👨‍👩 Parent' : (m.member_type === 'child' ? '🧒 Child' : '👶 Dependent'))}
                                    </span>
                                    ${responsible && responsible.id !== m.id ? `<div class="payment-responsible"><i class="fas fa-user-check"></i> Pays: ${responsible.name}</div>` : ''}
                                </td>
                                <td><div class="contact-icons" onclick="event.stopPropagation()">${m.phone ? `<button class="contact-icon-btn whatsapp" onclick="sendWhatsApp('${m.phone}', 'Hello ${m.name} from OBUNANGWE BULAIIRE!')" title="WhatsApp"><i class="fab fa-whatsapp"></i></button><button class="contact-icon-btn call" onclick="makeCall('${m.phone}')" title="Call"><i class="fas fa-phone"></i></button>` : '<span class="member-tooltip">—</span>'}</div></td>
                                <td>${m.blood_group ? `<span class="medical-badge-table"><i class="fas fa-tint"></i> ${m.blood_group}</span>` : ''}${m.allergies ? `<span class="medical-badge-table"><i class="fas fa-allergies"></i> Allergy</span>` : ''}${!m.blood_group && !m.allergies ? '—' : ''}</td>
                                <td>${m.location ? `<i class="fas fa-map-marker-alt"></i> ${m.location}` : '—'}</td>
                                <td class="balance-positive">UGX ${(stats.totalOwed || 0).toLocaleString()}</td>
                                <td style="color: var(--success); font-weight: 600;">UGX ${(stats.totalPaid || 0).toLocaleString()}</td>
                                <td class="${balanceClass}">UGX ${(stats.balance || 0).toLocaleString()}</td>
                                <td><div class="action-buttons" onclick="event.stopPropagation()"><button class="contact-icon-btn edit" onclick="openEditMember(${m.id})" title="Edit"><i class="fas fa-edit"></i></button><button class="contact-icon-btn delete" onclick="deleteMember(${m.id})" title="Delete"><i class="fas fa-trash"></i></button></div></td>
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
    const payments = await getAllPayments();
    document.getElementById('pageContent').innerHTML = `
        <div class="card">
            <h2>All Payments <button class="btn-primary" onclick="openAddModal()"><i class="fas fa-plus"></i> Record Payment</button></h2>
            <div class="members-table-container">
                <table class="data-table" style="width: 100%;">
                    <thead>
                        <tr><th>Date</th><th>Member</th><th>Activity</th><th>Amount (UGX)</th><th>Notes</th><th>Action</th></tr>
                    </thead>
                    <tbody>
                        ${payments.map(p => `
                            <tr>
                                <td>${new Date(p.payment_date).toLocaleDateString()}</td>
                                <td><strong>${p.memberName}</strong></td>
                                <td>${p.activityName}</td>
                                <td style="color: var(--success); font-weight: bold;">UGX ${p.amount.toLocaleString()}</td>
                                <td>${p.notes || '-'}</td>
                                <td><button class="btn-delete-payment" onclick="deletePayment(${p.id})"><i class="fas fa-trash-alt"></i> Delete</button></td>
                            </tr>
                        `).join('') || '<tr><td colspan="6" style="text-align:center;">No payments recorded</td></tr>'}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

// User Payments
async function renderUserPayments() {
    const payments = await getMemberPayments(_currentUser.id);
    document.getElementById('pageContent').innerHTML = `
        <div class="card">
            <h2>My Payment History</h2>
            <div class="members-table-container">
                <table class="data-table" style="width: 100%;">
                    <thead>
                        <tr><th>Date</th><th>Activity</th><th>Amount (UGX)</th><th>Notes</th></tr>
                    </thead>
                    <tbody>
                        ${payments.map(p => `
                            <tr>
                                <td>${new Date(p.payment_date).toLocaleDateString()}</td>
                                <td>${p.activityName}</td>
                                <td style="color: var(--success); font-weight: bold;">UGX ${p.amount.toLocaleString()}</td>
                                <td>${p.notes || '-'}</td>
                            </tr>
                        `).join('') || '<tr><td colspan="4" style="text-align:center;">No payment history</td></tr>'}
                    </tbody>
                </table>
            </div>
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
    
    // For regular users - Compact Card Layout
    if (_currentRole === 'user') {
        document.getElementById('pageContent').innerHTML = `
            <div class="card" style="padding: 12px;">
                <h2 style="font-size: 16px; margin-bottom: 10px;"><i class="fas fa-address-book"></i> Family Contacts</h2>
                <div class="contact-card-list">
                    ${members.map(m => `
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
                                        <span class="contact-role-badge ${m.member_type === 'board' ? 'board' : (m.member_type === 'parent' ? 'parent' : (m.member_type === 'child' ? 'child' : 'dependent'))}">
                                            ${m.member_type === 'board' ? 'Board' : (m.member_type === 'parent' ? 'Parent' : (m.member_type === 'child' ? 'Child' : 'Dep'))}
                                        </span>
                                    </div>
                                    <div class="contact-details">
                                        ${m.phone ? `<div class="contact-phone"><i class="fas fa-phone-alt"></i> ${m.phone}</div>` : ''}
                                        ${!m.phone && m.email ? `<div class="contact-email"><i class="fas fa-envelope"></i> ${m.email.substring(0, 20)}${m.email.length > 20 ? '...' : ''}</div>` : ''}
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
                    `).join('')}
                </div>
            </div>
        `;
    } 
    // For admin - Compact Table Layout
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
                                <th style="padding: 8px;">Type</th>
                                <th style="padding: 8px;">Phone</th>
                                <th style="padding: 8px;">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${members.map(m => `
                                <tr onclick="showMemberDetails(${m.id})" style="cursor: pointer;">
                                    <td style="padding: 8px;">
                                        ${m.profile_picture ? 
                                            `<img src="${m.profile_picture}" class="member-avatar-table">` : 
                                            `<div class="member-avatar-placeholder"><i class="fas ${m.member_type === 'board' ? 'fa-crown' : (m.member_type === 'parent' ? 'fa-user-tie' : 'fa-user-child')}" style="font-size: 14px;"></i></div>`
                                        }
                                    </td>
                                    <td style="padding: 8px; font-weight: 600; color: #01605a;">${m.name}${m.id === _currentUser?.id ? ' <span class="you-badge">You</span>' : ''}</td>
                                    <td style="padding: 8px;">
                                        <span class="contact-role-badge ${m.member_type === 'board' ? 'board' : (m.member_type === 'parent' ? 'parent' : (m.member_type === 'child' ? 'child' : 'dependent'))}">
                                            ${m.member_type === 'board' ? 'Board' : (m.member_type === 'parent' ? 'Parent' : (m.member_type === 'child' ? 'Child' : 'Dep'))}
                                        </span>
                                    </td>
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
                            `).join('')}
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
                <button class="btn-primary" onclick="changePassword()" style="margin-bottom:15px;">Change Password</button>
            </div>
        </div>
        
        <div class="card">
            <h2>Member Positions Management</h2>
            <div style="text-align:center;padding:30px">
                <i class="fas fa-tags" style="font-size:48px;color:var(--primary-teal);margin-bottom:15px;display:block;"></i>
                <p style="margin-bottom:20px;">Manage custom member positions and roles</p>
                <button class="btn-primary" onclick="openManagePositions()">
                    <i class="fas fa-plus"></i> Manage Positions
                </button>
            </div>
        </div>
        
        <div class="card">
            <h2>System Information</h2>
            <div class="members-table-container">
                <table class="data-table" style="width:100%;">
                    <tr>
                        <td><strong>Version</strong></td>
                        <td>3.0.0</div>
                    </tr>
                    <tr>
                        <td><strong>Database</strong></div>
                        <td>Supabase</div>
                    </tr>
                    <tr>
                        <td><strong>Activities</strong></div>
                        <td>${_activities.length}</div>
                    </tr>
                    <tr>
                        <td><strong>Members</strong></div>
                        <td>${_familyMembers.length}</div>
                    </tr>
                    <tr>
                        <td><strong>Positions</strong></div>
                        <td>${_memberPositions.length}</div>
                    </tr>
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
    } else if (memberType === 'parent') {
        if (boardPositionDiv) boardPositionDiv.style.display = 'none';
        if (parentSelectDiv) parentSelectDiv.style.display = 'none';
    } else if (memberType === 'child' || memberType === 'dependent') {
        if (boardPositionDiv) boardPositionDiv.style.display = 'none';
        if (parentSelectDiv) parentSelectDiv.style.display = 'block';
    }
}

// ============================================
// POPULATE DROPDOWNS
// ============================================
async function populateParentDropdown(formType, selectedId = null) {
    const members = await getFamilyMembers();
    // Get only parents, board members, and regular members who can pay
    const potentialParents = members.filter(m => 
        m.member_type === 'parent' || 
        m.member_type === 'board' || 
        (m.member_type === 'regular' && m.can_pay === true)
    );
    
    const parentSelect = formType === 'add' 
        ? document.getElementById('memberParentId')
        : document.getElementById('editMemberParentId');
    
    if (parentSelect) {
        parentSelect.innerHTML = '<option value="">Select parent/guardian...</option>';
        potentialParents.forEach(p => {
            const option = document.createElement('option');
            option.value = p.id;
            option.textContent = `${p.name} (${p.member_type === 'board' ? 'Board Member' : 'Parent'})`;
            if (selectedId && selectedId == p.id) {
                option.selected = true;
            }
            parentSelect.appendChild(option);
        });
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
        if (!m) return;
        
        console.log('✏️ Opening edit for:', m.name);
        
        // Populate positions first
        await populatePositionDropdowns();
        
        // Populate parent dropdown
        await populateParentDropdown('edit', m.parent_id);
        
        // Set form values
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
        document.getElementById('editMemberBoardPosition').value = m.board_position || '';
        
        // Set position dropdown value
        const positionSelect = document.getElementById('editMemberPositionId');
        if (positionSelect && m.position_id) {
            positionSelect.value = m.position_id;
        }
        
        // Handle parent selection for dependents
        if (m.parent_id) {
            const parentSelect = document.getElementById('editMemberParentId');
            if (parentSelect) parentSelect.value = m.parent_id;
        }
        
        // Trigger position change to show/hide fields
        onPositionChange('edit');
        
        // Display existing profile picture
        const preview = document.getElementById('editImagePreview');
        if (preview) {
            if (m.profile_picture) {
                preview.innerHTML = `<img src="${m.profile_picture}" alt="${m.name}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
            } else {
                preview.innerHTML = '<i class="fas fa-camera" style="font-size: 40px; color: white;"></i>';
            }
        }
        
        // Clear file input
        const imageInput = document.getElementById('editMemberImage');
        if (imageInput) imageInput.value = '';
        window._editImageFile = null;
        
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
            // NEW: Get positionId instead of memberType
            const positionId = document.getElementById('memberPositionId')?.value;
            const boardPosition = document.getElementById('memberBoardPosition')?.value;
            const parentId = document.getElementById('memberParentId')?.value;
            
            // Validate position is selected
            if (!positionId) {
                Swal.fire('Error', 'Please select a position/role for the member', 'error');
                submitBtn.innerHTML = originalText;
                submitBtn.disabled = false;
                return;
            }
            
            // IMPORTANT: Get the image file from the global variable
            const imageInput = document.getElementById('addMemberImage');
            const imageFile = imageInput && imageInput.files && imageInput.files.length > 0 
                ? imageInput.files[0] 
                : null;
            
            console.log('📷 Image file:', imageFile ? imageFile.name : 'No image');
            console.log('📌 Position ID:', positionId);
            
            const result = await addMember(
                document.getElementById('memberName').value,
                'child', // role parameter (not used heavily anymore)
                document.getElementById('memberPhone').value,
                document.getElementById('memberEmail').value,
                imageFile,
                document.getElementById('memberDob')?.value,
                document.getElementById('memberBloodGroup')?.value,
                document.getElementById('memberAllergies')?.value,
                document.getElementById('memberEmergencyContact')?.value,
                document.getElementById('memberOccupation')?.value,
                document.getElementById('memberLocation')?.value,
                document.getElementById('memberMaritalStatus')?.value,
                document.getElementById('memberAnniversary')?.value,
                document.getElementById('memberBio')?.value,
                document.getElementById('memberFavoriteColor')?.value,
                positionId,  // Pass positionId instead of memberType
                boardPosition,
                parentId
            );
            
            if (result) {
                closeModal('addMemberModal');
                newForm.reset();
                const preview = document.getElementById('addImagePreview');
                if (preview) preview.innerHTML = '<i class="fas fa-camera"></i><span>Add Photo</span>';
                const imageInputField = document.getElementById('addMemberImage');
                if (imageInputField) imageInputField.value = '';
                await renderCurrentPage();
                queueToast('✅ Member Added', 'New family member has been added successfully.', 'success', 3000);
            }
        } catch (error) {
            console.error('❌ Error adding member:', error);
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
            // NEW: Get positionId instead of memberType
            const positionId = document.getElementById('editMemberPositionId')?.value;
            const boardPosition = document.getElementById('editMemberBoardPosition')?.value;
            const parentId = document.getElementById('editMemberParentId')?.value;
            
            // Validate position is selected
            if (!positionId) {
                Swal.fire('Error', 'Please select a position/role for the member', 'error');
                submitBtn.innerHTML = originalText;
                submitBtn.disabled = false;
                return;
            }
            
            // Get the image file
            const imageInput = document.getElementById('editMemberImage');
            const imageFile = imageInput && imageInput.files && imageInput.files.length > 0 
                ? imageInput.files[0] 
                : null;
            
            console.log('📷 Edit - Image file:', imageFile ? imageFile.name : 'No new image');
            console.log('📌 Edit - Position ID:', positionId);
            
            const result = await updateMember(
                parseInt(document.getElementById('editMemberId').value),
                document.getElementById('editMemberName').value,
                'child', // role parameter
                document.getElementById('editMemberPhone').value,
                document.getElementById('editMemberEmail').value,
                imageFile,
                document.getElementById('editMemberDob')?.value,
                document.getElementById('editMemberBloodGroup')?.value,
                document.getElementById('editMemberAllergies')?.value,
                document.getElementById('editMemberEmergencyContact')?.value,
                document.getElementById('editMemberOccupation')?.value,
                document.getElementById('editMemberLocation')?.value,
                document.getElementById('editMemberMaritalStatus')?.value,
                document.getElementById('editMemberAnniversary')?.value,
                document.getElementById('editMemberBio')?.value,
                document.getElementById('editMemberFavoriteColor')?.value,
                positionId,  // Pass positionId instead of memberType
                boardPosition,
                parentId
            );
            
            if (result) {
                closeModal('editMemberModal');
                const imageInputField = document.getElementById('editMemberImage');
                if (imageInputField) imageInputField.value = '';
                await renderCurrentPage();
                queueToast('✅ Member Updated', 'Family member has been updated successfully.', 'success', 3000);
            }
        } catch (error) {
            console.error('❌ Error updating member:', error);
            Swal.fire('Error', 'Failed to update member. Please try again.', 'error');
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
// POSITION MANAGEMENT FUNCTIONS
// ============================================

// Load member positions from database
async function loadMemberPositions() {
    console.log('📋 Loading member positions...');
    try {
        const { data, error } = await _supabase
            .from('member_positions')
            .select('*')
            .order('category', { ascending: true })
            .order('position_name', { ascending: true });
        
        if (error) {
            console.error('Error fetching positions:', error);
            _memberPositions = [];
            return [];
        }
        
        _memberPositions = data || [];
        console.log(`✅ Loaded ${_memberPositions.length} positions`);
        return _memberPositions;
    } catch (err) {
        console.error('Failed to load positions:', err);
        _memberPositions = [];
        return [];
    }
}

// Get all positions (simple getter)
function getMemberPositions() {
    return _memberPositions;
}

// Populate position dropdowns in add and edit forms
async function populatePositionDropdowns() {
    console.log('🔄 Populating position dropdowns');
    
    try {
        // Ensure positions are loaded
        let positions = _memberPositions;
        if (!positions || positions.length === 0) {
            positions = await loadMemberPositions();
        }
        
        console.log(`Found ${positions.length} positions`);
        
        // Populate add member dropdown
        const addPositionSelect = document.getElementById('memberPositionId');
        if (addPositionSelect) {
            addPositionSelect.innerHTML = '<option value="">Select position...</option>';
            positions.forEach(pos => {
                const option = document.createElement('option');
                option.value = pos.id;
                let categoryLabel = '';
                if (pos.category === 'board') categoryLabel = '🏛️ ';
                else if (pos.category === 'parent') categoryLabel = '👨‍👩 ';
                else if (pos.category === 'regular') categoryLabel = '👤 ';
                else if (pos.category === 'dependent') categoryLabel = '👶 ';
                option.textContent = `${categoryLabel}${pos.position_name}`;
                addPositionSelect.appendChild(option);
            });
            console.log('✅ Add member dropdown populated');
        } else {
            console.warn('memberPositionId select not found');
        }
        
        // Populate edit member dropdown
        const editPositionSelect = document.getElementById('editMemberPositionId');
        if (editPositionSelect) {
            editPositionSelect.innerHTML = '<option value="">Select position...</option>';
            positions.forEach(pos => {
                const option = document.createElement('option');
                option.value = pos.id;
                let categoryLabel = '';
                if (pos.category === 'board') categoryLabel = '🏛️ ';
                else if (pos.category === 'parent') categoryLabel = '👨‍👩 ';
                else if (pos.category === 'regular') categoryLabel = '👤 ';
                else if (pos.category === 'dependent') categoryLabel = '👶 ';
                option.textContent = `${categoryLabel}${pos.position_name}`;
                editPositionSelect.appendChild(option);
            });
            console.log('✅ Edit member dropdown populated');
        }
    } catch (error) {
        console.error('Error in populatePositionDropdowns:', error);
    }
}

// Refresh position dropdowns (alias)
async function refreshPositionDropdowns() {
    await populatePositionDropdowns();
}

// Populate parent dropdown for dependent members
async function populateParentDropdown(formType, selectedId = null) {
    console.log('🔄 Populating parent dropdown for:', formType);
    
    try {
        const members = _familyMembers || [];
        // Get only parents, board members, and regular members who can pay
        const potentialParents = members.filter(m => 
            m.member_type === 'parent' || 
            m.member_type === 'board' || 
            (m.member_type === 'regular' && m.can_pay === true)
        );
        
        const parentSelect = formType === 'add' 
            ? document.getElementById('memberParentId')
            : document.getElementById('editMemberParentId');
        
        if (parentSelect) {
            parentSelect.innerHTML = '<option value="">Select parent/guardian...</option>';
            potentialParents.forEach(p => {
                const option = document.createElement('option');
                option.value = p.id;
                option.textContent = `${p.name} (${p.member_type === 'board' ? 'Board Member' : 'Parent'})`;
                if (selectedId && selectedId == p.id) {
                    option.selected = true;
                }
                parentSelect.appendChild(option);
            });
            console.log(`✅ Parent dropdown populated with ${potentialParents.length} options`);
        }
    } catch (error) {
        console.error('Error in populateParentDropdown:', error);
    }
}

// Handle position change in forms
async function onPositionChange(formType) {
    console.log('🔄 Position changed for:', formType);
    
    const positionId = formType === 'add' 
        ? document.getElementById('memberPositionId')?.value 
        : document.getElementById('editMemberPositionId')?.value;
    
    const boardDiv = formType === 'add' 
        ? document.getElementById('addBoardPositionDiv') 
        : document.getElementById('editBoardPositionDiv');
    
    const parentDiv = formType === 'add' 
        ? document.getElementById('addParentSelectDiv') 
        : document.getElementById('editParentSelectDiv');
    
    if (!positionId) {
        if (boardDiv) boardDiv.style.display = 'none';
        if (parentDiv) parentDiv.style.display = 'none';
        return;
    }
    
    // Get positions
    let positions = _memberPositions;
    if (!positions || positions.length === 0) {
        positions = await loadMemberPositions();
    }
    
    const selectedPosition = positions.find(p => p.id === parseInt(positionId));
    if (!selectedPosition) return;
    
    // Show/hide board position field
    if (selectedPosition.category === 'board') {
        if (boardDiv) boardDiv.style.display = 'block';
    } else {
        if (boardDiv) boardDiv.style.display = 'none';
    }
    
    // Show/hide parent selection for dependents
    if (selectedPosition.category === 'dependent') {
        if (parentDiv) parentDiv.style.display = 'block';
        await populateParentDropdown(formType);
    } else {
        if (parentDiv) parentDiv.style.display = 'none';
    }
}

// Add new position
async function addNewPosition() {
    const positionName = document.getElementById('newPositionName')?.value.trim();
    const category = document.getElementById('newPositionCategory')?.value;
    const paymentCategory = document.getElementById('newPositionPaymentCategory')?.value;
    const weight = parseFloat(document.getElementById('newPositionWeight')?.value || 1);
    const canPay = document.getElementById('newPositionCanPay')?.checked;
    const description = document.getElementById('newPositionDescription')?.value;
    
    if (!positionName) {
        Swal.fire('Error', 'Please enter a position name', 'error');
        return;
    }
    
    const { data, error } = await _supabase
        .from('member_positions')
        .insert({
            position_name: positionName,
            category: category,
            payment_category: paymentCategory,
            contribution_weight: weight,
            can_pay: canPay,
            description: description || null,
            is_active: true
        })
        .select();
    
    if (error) {
        Swal.fire('Error', error.message, 'error');
        return;
    }
    
    Swal.fire('Success!', `Position "${positionName}" added successfully.`, 'success');
    
    // Clear form
    document.getElementById('newPositionName').value = '';
    document.getElementById('newPositionDescription').value = '';
    document.getElementById('newPositionCategory').value = 'regular';
    document.getElementById('newPositionPaymentCategory').value = 'payer';
    document.getElementById('newPositionWeight').value = '1';
    document.getElementById('newPositionCanPay').checked = true;
    
    // Reload and refresh
    await loadMemberPositions();
    await refreshPositionDropdowns();
    await loadAndDisplayPositions();
}

// Delete position
async function deletePosition(positionId, positionName) {
    // Check if any members use this position
    const { data: members, error } = await _supabase
        .from('family_members')
        .select('id')
        .eq('position_id', positionId)
        .limit(1);
    
    if (error) {
        Swal.fire('Error', error.message, 'error');
        return;
    }
    
    if (members && members.length > 0) {
        Swal.fire({
            title: 'Cannot Delete',
            text: `Position "${positionName}" is currently assigned to family members. Please reassign them first.`,
            icon: 'warning'
        });
        return;
    }
    
    const result = await Swal.fire({
        title: 'Delete Position?',
        text: `Are you sure you want to delete "${positionName}"?`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#e74c3c',
        confirmButtonText: 'Yes, delete'
    });
    
    if (result.isConfirmed) {
        const { error: deleteError } = await _supabase
            .from('member_positions')
            .delete()
            .eq('id', positionId);
        
        if (deleteError) {
            Swal.fire('Error', deleteError.message, 'error');
        } else {
            Swal.fire('Deleted!', `Position "${positionName}" has been deleted.`, 'success');
            await loadMemberPositions();
            await refreshPositionDropdowns();
            
            // Refresh the positions list in modal if open
            const modal = document.getElementById('managePositionsModal');
            if (modal && modal.style.display === 'flex') {
                await loadAndDisplayPositions();
            }
        }
    }
}

// Load and display positions in the manage modal
async function loadAndDisplayPositions() {
    const container = document.getElementById('positionsList');
    if (!container) return;
    
    const positions = _memberPositions;
    
    if (!positions || positions.length === 0) {
        container.innerHTML = '<p style="text-align:center; color:#999;">No positions defined. Add your first position above.</p>';
        return;
    }
    
    // Group by category
    const grouped = {
        board: positions.filter(p => p.category === 'board'),
        parent: positions.filter(p => p.category === 'parent'),
        regular: positions.filter(p => p.category === 'regular'),
        dependent: positions.filter(p => p.category === 'dependent')
    };
    
    const categoryNames = {
        board: '🏛️ Board / Leadership',
        parent: '👨‍👩 Parents',
        regular: '👤 Regular Members',
        dependent: '👶 Dependents'
    };
    
    const paymentCategoryLabels = {
        payer: '<span style="color: #27ae60;">✅ Payer</span>',
        partial_payer: '<span style="color: #f39c12;">⚠️ Partial Payer</span>',
        non_payer: '<span style="color: #e74c3c;">❌ Non-Payer</span>'
    };
    
    let html = '';
    
    for (const [category, categoryPositions] of Object.entries(grouped)) {
        if (categoryPositions.length === 0) continue;
        
        html += `
            <div style="margin-bottom: 25px;">
                <h4 style="color: var(--primary-teal); margin-bottom: 10px; padding-bottom: 5px; border-bottom: 2px solid var(--primary-orange);">
                    ${categoryNames[category]}
                </h4>
                <div style="background: var(--gray-50); border-radius: 10px; overflow: hidden;">
                    <table style="width: 100%; border-collapse: collapse;">
                        <thead>
                            <tr style="background: var(--gray-200);">
                                <th style="padding: 10px; text-align: left;">Position</th>
                                <th style="padding: 10px; text-align: center;">Payment Status</th>
                                <th style="padding: 10px; text-align: center;">Weight</th>
                                <th style="padding: 10px; text-align: left;">Description</th>
                                <th style="padding: 10px; text-align: center;">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
        `;
        
        for (const pos of categoryPositions) {
            const paymentLabel = paymentCategoryLabels[pos.payment_category] || 'Payer';
            html += `
                <tr style="border-bottom: 1px solid var(--gray-200);">
                    <td style="padding: 10px;">
                        <strong>${escapeHtml(pos.position_name)}</strong>
                     </div>
                    <td style="padding: 10px; text-align: center;">${paymentLabel}</div>
                    <td style="padding: 10px; text-align: center;">
                        <span style="background: var(--primary-gradient); color: white; padding: 2px 8px; border-radius: 15px; font-size: 12px;">${pos.contribution_weight}x</span>
                    </div>
                    <td style="padding: 10px; font-size: 12px; color: #666;">${escapeHtml(pos.description) || '—'}</div>
                    <td style="padding: 10px; text-align: center;">
                        <button class="btn-edit" onclick="editPosition(${pos.id})" style="margin-right: 5px; padding: 4px 8px;">
                            <i class="fas fa-edit"></i> Edit
                        </button>
                        <button class="btn-danger" onclick="deletePosition(${pos.id}, '${escapeHtml(pos.position_name)}')" style="padding: 4px 8px;">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </tr>
            `;
        }
        
        html += `
                        </tbody>
                    </tr>
                </div>
            </div>
        `;
    }
    
    container.innerHTML = html;
}

// Edit position
async function editPosition(positionId) {
    const positions = await getMemberPositions();
    const position = positions.find(p => p.id === positionId);
    
    if (!position) return;
    
    const { value: formValues } = await Swal.fire({
        title: 'Edit Position',
        html: `
            <div style="text-align: left;">
                <div class="form-group">
                    <label>Position Name</label>
                    <input id="editPositionName" class="swal2-input" value="${escapeHtml(position.position_name)}" style="width: 100%;">
                </div>
                <div class="form-group">
                    <label>Category</label>
                    <select id="editPositionCategory" class="swal2-select" style="width: 100%;">
                        <option value="board" ${position.category === 'board' ? 'selected' : ''}>🏛️ Board (Leadership)</option>
                        <option value="parent" ${position.category === 'parent' ? 'selected' : ''}>👨‍👩 Parent</option>
                        <option value="regular" ${position.category === 'regular' ? 'selected' : ''}>👤 Regular Member</option>
                        <option value="dependent" ${position.category === 'dependent' ? 'selected' : ''}>👶 Dependent</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Payment Category</label>
                    <select id="editPositionPaymentCategory" class="swal2-select" style="width: 100%;">
                        <option value="payer" ${position.payment_category === 'payer' ? 'selected' : ''}>✅ Payer (Pays full share)</option>
                        <option value="partial_payer" ${position.payment_category === 'partial_payer' ? 'selected' : ''}>⚠️ Partial Payer (Pays reduced share)</option>
                        <option value="non_payer" ${position.payment_category === 'non_payer' ? 'selected' : ''}>❌ Non-Payer (Exempt)</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Contribution Weight</label>
                    <select id="editPositionWeight" class="swal2-select" style="width: 100%;">
                        <option value="0" ${position.contribution_weight === 0 ? 'selected' : ''}>0x - No payment</option>
                        <option value="0.25" ${position.contribution_weight === 0.25 ? 'selected' : ''}>0.25x - Quarter share</option>
                        <option value="0.5" ${position.contribution_weight === 0.5 ? 'selected' : ''}>0.5x - Half share</option>
                        <option value="0.75" ${position.contribution_weight === 0.75 ? 'selected' : ''}>0.75x - Three-quarter share</option>
                        <option value="1" ${position.contribution_weight === 1 ? 'selected' : ''}>1x - Standard share</option>
                        <option value="1.25" ${position.contribution_weight === 1.25 ? 'selected' : ''}>1.25x - One and quarter share</option>
                        <option value="1.5" ${position.contribution_weight === 1.5 ? 'selected' : ''}>1.5x - One and half share</option>
                        <option value="2" ${position.contribution_weight === 2 ? 'selected' : ''}>2x - Double share</option>
                        <option value="2.5" ${position.contribution_weight === 2.5 ? 'selected' : ''}>2.5x - Two and half share</option>
                        <option value="3" ${position.contribution_weight === 3 ? 'selected' : ''}>3x - Triple share</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>
                        <input type="checkbox" id="editPositionCanPay" ${position.can_pay ? 'checked' : ''}> Can Pay
                    </label>
                </div>
                <div class="form-group">
                    <label>Description</label>
                    <input id="editPositionDescription" class="swal2-input" value="${escapeHtml(position.description || '')}" style="width: 100%;" placeholder="Optional description">
                </div>
            </div>
        `,
        focusConfirm: false,
        preConfirm: () => {
            const name = document.getElementById('editPositionName').value;
            if (!name) {
                Swal.showValidationMessage('Position name is required');
                return false;
            }
            return {
                name: name,
                category: document.getElementById('editPositionCategory').value,
                payment_category: document.getElementById('editPositionPaymentCategory').value,
                contribution_weight: parseFloat(document.getElementById('editPositionWeight').value),
                can_pay: document.getElementById('editPositionCanPay').checked,
                description: document.getElementById('editPositionDescription').value
            };
        },
        showCancelButton: true,
        confirmButtonText: 'Save Changes',
        cancelButtonText: 'Cancel'
    });
    
    if (formValues) {
        const { error } = await _supabase
            .from('member_positions')
            .update({
                position_name: formValues.name,
                category: formValues.category,
                payment_category: formValues.payment_category,
                contribution_weight: formValues.contribution_weight,
                can_pay: formValues.can_pay,
                description: formValues.description
            })
            .eq('id', positionId);
        
        if (error) {
            Swal.fire('Error', error.message, 'error');
        } else {
            Swal.fire('Success!', 'Position updated successfully.', 'success');
            await loadMemberPositions();
            await refreshPositionDropdowns();
            await loadAndDisplayPositions();
        }
    }
}

// Open manage positions modal
async function openManagePositions() {
    await loadMemberPositions();
    await loadAndDisplayPositions();
    document.getElementById('managePositionsModal').style.display = 'flex';
}

// Helper function to escape HTML
function escapeHtml(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// ============================================
// MODAL FUNCTIONS - FIXED
// ============================================

function openAddModal() {
    console.log('📂 Opening Add Member Modal');
    
    if (_currentRole !== 'admin') { 
        Swal.fire('Access Denied', 'Only administrators can add members', 'error'); 
        return; 
    }
    
    if (_currentPage === 'activities') {
        document.getElementById('addActivityModal').style.display = 'flex';
    } 
    else if (_currentPage === 'members') {
        try {
            // Reset form
            const form = document.getElementById('addMemberForm');
            if (form) form.reset();
            
            // Reset image preview
            const preview = document.getElementById('addImagePreview');
            if (preview) preview.innerHTML = '<i class="fas fa-camera"></i><span>Add Photo</span>';
            
            // Refresh position dropdowns
            refreshPositionDropdowns();
            
            // Populate parent dropdown
            populateParentDropdown('add');
            
            // Clear any stored image
            window._addImageFile = null;
            
            // Hide conditional divs
            const boardDiv = document.getElementById('addBoardPositionDiv');
            const parentDiv = document.getElementById('addParentSelectDiv');
            if (boardDiv) boardDiv.style.display = 'none';
            if (parentDiv) parentDiv.style.display = 'none';
            
            // Show the modal
            const modal = document.getElementById('addMemberModal');
            if (modal) {
                modal.style.display = 'flex';
                console.log('✅ Add Member Modal opened');
            } else {
                console.error('❌ Add Member Modal element not found');
            }
        } catch (error) {
            console.error('Error opening add member modal:', error);
            Swal.fire('Error', 'Failed to open add member form', 'error');
        }
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
                memberSelect.innerHTML = members.map(m => `<option value="${m.id}">${m.name}</option>`).join('');
            }
            const paymentDate = document.getElementById('paymentDate');
            if (paymentDate) paymentDate.value = new Date().toISOString().split('T')[0];
            
            document.getElementById('paymentModal').style.display = 'flex';
        })();
    }
}

function openEditMember(id) {
    console.log('✏️ Opening Edit Member Modal for ID:', id);
    
    (async () => {
        try {
            const m = _familyMembers.find(member => member.id === id);
            if (!m) {
                console.error('Member not found with ID:', id);
                Swal.fire('Error', 'Member not found', 'error');
                return;
            }
            
            console.log('Editing member:', m.name);
            
            // Refresh position dropdowns first
            await refreshPositionDropdowns();
            
            // Populate parent dropdown
            await populateParentDropdown('edit', m.parent_id);
            
            // Set form values
            document.getElementById('editMemberId').value = m.id;
            document.getElementById('editMemberName').value = m.name || '';
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
            document.getElementById('editMemberBoardPosition').value = m.board_position || '';
            
            // Set position dropdown value
            const positionSelect = document.getElementById('editMemberPositionId');
            if (positionSelect && m.position_id) {
                positionSelect.value = m.position_id;
            }
            
            // Handle parent selection for dependents
            if (m.parent_id) {
                const parentSelect = document.getElementById('editMemberParentId');
                if (parentSelect) parentSelect.value = m.parent_id;
            }
            
            // Trigger position change to show/hide fields
            onPositionChange('edit');
            
            // Display existing profile picture
            const preview = document.getElementById('editImagePreview');
            if (preview) {
                if (m.profile_picture && m.profile_picture.startsWith('http')) {
                    preview.innerHTML = `<img src="${m.profile_picture}" alt="${m.name}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
                } else {
                    preview.innerHTML = '<i class="fas fa-camera" style="font-size: 40px; color: white;"></i>';
                }
            }
            
            // Clear file input
            const imageInput = document.getElementById('editMemberImage');
            if (imageInput) imageInput.value = '';
            window._editImageFile = null;
            
            // Show the modal
            const modal = document.getElementById('editMemberModal');
            if (modal) {
                modal.style.display = 'flex';
                console.log('✅ Edit Member Modal opened');
            } else {
                console.error('❌ Edit Member Modal element not found');
            }
        } catch (error) {
            console.error('Error opening edit member modal:', error);
            Swal.fire('Error', 'Failed to open edit member form', 'error');
        }
    })();
}

// Make sure these functions are exposed globally
window.openAddModal = openAddModal;
window.openEditMember = openEditMember;



async function refreshPositionDropdowns() {
    console.log('🔄 Refreshing position dropdowns');
    
    // Get positions from global variable
    const positions = _memberPositions || [];
    
    // Populate add member dropdown
    const addPositionSelect = document.getElementById('memberPositionId');
    if (addPositionSelect) {
        addPositionSelect.innerHTML = '<option value="">Select position...</option>';
        positions.forEach(pos => {
            const option = document.createElement('option');
            option.value = pos.id;
            let categoryLabel = '';
            if (pos.category === 'board') categoryLabel = '🏛️ ';
            else if (pos.category === 'parent') categoryLabel = '👨‍👩 ';
            else if (pos.category === 'regular') categoryLabel = '👤 ';
            else if (pos.category === 'dependent') categoryLabel = '👶 ';
            option.textContent = `${categoryLabel}${pos.position_name}`;
            addPositionSelect.appendChild(option);
        });
        console.log(`✅ Added ${positions.length} positions to add form`);
    }
    
    // Populate edit member dropdown
    const editPositionSelect = document.getElementById('editMemberPositionId');
    if (editPositionSelect) {
        editPositionSelect.innerHTML = '<option value="">Select position...</option>';
        positions.forEach(pos => {
            const option = document.createElement('option');
            option.value = pos.id;
            let categoryLabel = '';
            if (pos.category === 'board') categoryLabel = '🏛️ ';
            else if (pos.category === 'parent') categoryLabel = '👨‍👩 ';
            else if (pos.category === 'regular') categoryLabel = '👤 ';
            else if (pos.category === 'dependent') categoryLabel = '👶 ';
            option.textContent = `${categoryLabel}${pos.position_name}`;
            editPositionSelect.appendChild(option);
        });
        console.log(`✅ Added ${positions.length} positions to edit form`);
    }
}


// ============================================
// ACTIVITY FUNCTIONS WITH POSITION-BASED DISTRIBUTION
// ============================================

// Get all members with their payment eligibility (based on positions)
async function getPaymentEligibleMembers() {
    const members = await getFamilyMembers();
    const positions = await getMemberPositions();
    
    const eligibleMembers = [];
    
    for (const member of members) {
        const position = positions.find(p => p.id === member.position_id);
        
        // Determine if member should pay based on position
        let shouldPay = true;
        let weight = 1.0;
        let reason = '';
        let paymentCategory = 'payer';
        
        if (position) {
            paymentCategory = position.payment_category || 'payer';
            weight = position.contribution_weight || 1.0;
            
            if (paymentCategory === 'non_payer') {
                shouldPay = false;
                reason = `${position.position_name} - Non-paying position`;
            } else if (paymentCategory === 'partial_payer') {
                shouldPay = true;
                reason = `${position.position_name} - Pays ${weight}x share`;
            } else {
                shouldPay = position.can_pay !== false;
                reason = `${position.position_name} - Pays ${weight}x share`;
            }
        } else {
            // Fallback if no position assigned
            if (member.member_type === 'dependent') {
                shouldPay = false;
                reason = 'Dependent - Non-paying';
            } else if (member.member_type === 'board') {
                shouldPay = true;
                weight = 2.0;
                reason = 'Board Member - Double share';
            } else if (member.member_type === 'parent') {
                shouldPay = true;
                weight = 1.0;
                reason = 'Parent - Standard share';
            } else if (member.member_type === 'child' && member.can_pay === false) {
                shouldPay = false;
                reason = 'Child - Non-paying';
            } else {
                shouldPay = member.can_pay !== false;
                weight = 1.0;
                reason = 'Regular member - Standard share';
            }
        }
        
        // Check if member has a responsible payer
        if (member.payment_responsible_id && member.payment_responsible_id !== member.id) {
            const responsible = members.find(m => m.id === member.payment_responsible_id);
            if (responsible) {
                shouldPay = false;
                reason = `Payments handled by ${responsible.name}`;
            }
        }
        
        eligibleMembers.push({
            id: member.id,
            name: member.name,
            member_type: member.member_type,
            position_name: position?.position_name || member.member_type,
            shouldPay: shouldPay,
            weight: weight,
            payment_category: paymentCategory,
            reason: reason,
            can_pay: member.can_pay !== false
        });
    }
    
    return eligibleMembers;
}

// Calculate smart budget distribution based on positions
async function calculateSmartDistribution(totalBudget, activityId) {
    const eligibleMembers = await getPaymentEligibleMembers();
    
    // Filter only members who should pay
    const payingMembers = eligibleMembers.filter(m => m.shouldPay === true);
    
    if (payingMembers.length === 0) {
        return { 
            distribution: [], 
            totalPayers: 0, 
            totalWeight: 0,
            sharePerWeight: 0,
            message: 'No eligible paying members found! Please check position payment settings.'
        };
    }
    
    // Calculate total weight
    let totalWeight = 0;
    for (const member of payingMembers) {
        totalWeight += member.weight;
    }
    
    // Calculate amount per weight unit
    const sharePerWeight = totalBudget / totalWeight;
    
    // Distribute to each paying member
    const distribution = [];
    for (const member of payingMembers) {
        const amountOwed = sharePerWeight * member.weight;
        distribution.push({
            memberId: member.id,
            memberName: member.name,
            memberType: member.member_type,
            position: member.position_name,
            weight: member.weight,
            payment_category: member.payment_category,
            amountOwed: amountOwed,
            shouldPay: true
        });
    }
    
    // Add non-paying members for reference
    const nonPayingMembers = eligibleMembers.filter(m => m.shouldPay === false);
    for (const member of nonPayingMembers) {
        distribution.push({
            memberId: member.id,
            memberName: member.name,
            memberType: member.member_type,
            position: member.position_name,
            weight: 0,
            amountOwed: 0,
            shouldPay: false,
            reason: member.reason,
            payment_category: member.payment_category
        });
    }
    
    return {
        distribution: distribution,
        totalPayers: payingMembers.length,
        totalWeight: totalWeight,
        sharePerWeight: sharePerWeight,
        message: `${payingMembers.length} members will split UGX ${totalBudget.toLocaleString()} based on their position weights.`
    };
}

// Show distribution preview before creating activity
async function showDistributionPreview(budget) {
    const eligibleMembers = await getPaymentEligibleMembers();
    const payingMembers = eligibleMembers.filter(m => m.shouldPay === true);
    
    if (payingMembers.length === 0) {
        const result = await Swal.fire({
            title: '⚠️ No Paying Members',
            html: `
                <div style="text-align: left;">
                    <p>There are no members eligible to pay.</p>
                    <p>Please check:</p>
                    <ul style="margin-left: 20px;">
                        <li>Member positions have payment category = "Payer" or "Partial Payer"</li>
                        <li>Members are assigned to correct positions</li>
                        <li>"Can Pay" setting is enabled for the position</li>
                    </ul>
                </div>
            `,
            icon: 'warning',
            confirmButtonText: 'Go to Positions',
            showCancelButton: true,
            cancelButtonText: 'Cancel'
        });
        
        if (result.isConfirmed) {
            openManagePositions();
        }
        return false;
    }
    
    // Calculate distribution
    let totalWeight = payingMembers.reduce((sum, m) => sum + m.weight, 0);
    const sharePerWeight = budget / totalWeight;
    
    let distributionHtml = `
        <div style="max-height: 400px; overflow-y: auto;">
            <div style="background: var(--primary-light); padding: 10px; border-radius: 10px; margin-bottom: 15px;">
                <p style="margin: 0;"><strong>💰 Budget:</strong> UGX ${budget.toLocaleString()}</p>
                <p style="margin: 5px 0 0;"><strong>⚖️ Total Weight:</strong> ${totalWeight} shares</p>
                <p style="margin: 5px 0 0;"><strong>📊 Each share:</strong> UGX ${sharePerWeight.toLocaleString()}</p>
            </div>
            <table style="width: 100%; border-collapse: collapse;">
                <thead>
                    <tr style="background: var(--primary-teal); color: white;">
                        <th style="padding: 10px; text-align: left;">Member</th>
                        <th style="padding: 10px; text-align: left;">Position</th>
                        <th style="padding: 10px; text-align: center;">Weight</th>
                        <th style="padding: 10px; text-align: right;">Amount (UGX)</th>
                    </tr>
                </thead>
                <tbody>
    `;
    
    for (const member of payingMembers) {
        const amount = sharePerWeight * member.weight;
        distributionHtml += `
            <tr style="border-bottom: 1px solid #ddd;">
                <td style="padding: 8px;"><strong>${member.name}</strong>${member.payment_category === 'partial_payer' ? ' <span style="font-size: 10px; color: #f39c12;">(Partial)</span>' : ''}</td>
                <td style="padding: 8px;">${member.position_name}</td>
                <td style="padding: 8px; text-align: center;">${member.weight}x</td>
                <td style="padding: 8px; text-align: right; color: var(--success); font-weight: bold;">UGX ${amount.toLocaleString()}</td>
            </tr>
        `;
    }
    
    distributionHtml += `
                </tbody>
            </table>
            <div style="margin-top: 15px; padding: 10px; background: #e8f5e9; border-radius: 8px;">
                <strong>📋 Summary:</strong> ${payingMembers.length} paying members | Total weight: ${totalWeight} shares
            </div>
            <div style="margin-top: 10px; padding: 8px; background: #fff3e0; border-radius: 8px; font-size: 12px;">
                <i class="fas fa-info-circle"></i> Non-paying members (dependents, children) are exempt from this activity.
            </div>
        </div>
    `;
    
    const result = await Swal.fire({
        title: '💰 Budget Distribution Preview',
        html: distributionHtml,
        icon: 'info',
        showCancelButton: true,
        confirmButtonText: '✅ Create Activity',
        cancelButtonText: 'Cancel',
        confirmButtonColor: '#27ae60',
        width: '700px'
    });
    
    return result.isConfirmed;
}

// CREATE ACTIVITY - Updated
async function createActivity(name, desc, budget, dueDate) {
    if (_currentRole !== 'admin') { 
        Swal.fire('Access Denied', 'Only administrators can create activities', 'error'); 
        return false; 
    }
    
    // Validate inputs
    if (!name) {
        Swal.fire('Error', 'Activity name is required', 'error');
        return false;
    }
    
    const budgetValue = parseFloat(budget);
    if (isNaN(budgetValue) || budgetValue <= 0) {
        Swal.fire('Error', 'Please enter a valid budget amount', 'error');
        return false;
    }
    
    if (!dueDate) {
        Swal.fire('Error', 'Due date is required', 'error');
        return false;
    }
    
    // Show distribution preview first
    const confirmed = await showDistributionPreview(budgetValue);
    if (!confirmed) return false;
    
    const members = await getFamilyMembers();
    if (members.length === 0) {
        Swal.fire('Error', 'No family members found.', 'error');
        return false;
    }
    
    // Create the activity
    const { data: activity, error } = await _supabase
        .from('activities')
        .insert({ 
            name: name, 
            description: desc || null, 
            total_budget: budgetValue, 
            expected_completion_date: dueDate, 
            status: 'active' 
        })
        .select();
    
    if (error) { 
        console.error('Create activity error:', error);
        Swal.fire('Error', error.message, 'error'); 
        return false; 
    }
    
    const activityId = activity[0].id;
    
    // Get smart distribution based on positions
    const distribution = await calculateSmartDistribution(budgetValue, activityId);
    
    // Assign amounts to members
    for (const member of members) {
        const dist = distribution.distribution.find(d => d.memberId === member.id);
        const amountOwed = dist ? dist.amountOwed : 0;
        const status = amountOwed === 0 ? 'exempt' : 'unpaid';
        const notes = dist && !dist.shouldPay ? dist.reason : null;
        
        await _supabase.from('member_activities').insert({
            activity_id: activityId,
            member_id: member.id,
            amount_owed: amountOwed,
            amount_paid: 0,
            status: status,
            notes: notes
        });
    }
    
    await loadData();
    
    // Send notification
    addNotification('📢 New Activity', `"${name}" has been created with budget UGX ${budgetValue.toLocaleString()}`);
    
    Swal.fire({
        title: '✅ Activity Created!',
        html: `
            <div style="text-align: left;">
                <p><strong>${name}</strong> created successfully.</p>
                <p>💰 Budget: UGX ${budgetValue.toLocaleString()}</p>
                <p>👥 Paying members: ${distribution.totalPayers}</p>
                <p>⚖️ Distribution based on position weights.</p>
            </div>
        `,
        icon: 'success',
        confirmButtonText: 'OK'
    });
    
    return true;
}

// UPDATE ACTIVITY - Updated
async function updateActivity(id, name, desc, budget, dueDate, status) {
    if (_currentRole !== 'admin') { 
        Swal.fire('Access Denied', 'Only administrators can edit activities', 'error'); 
        return false; 
    }
    
    const oldActivity = _activities.find(a => a.id === id);
    const newBudget = parseFloat(budget);
    
    // If budget changed or status changing to completed, handle accordingly
    if (status === 'completed' && oldActivity?.status !== 'completed') {
        const result = await Swal.fire({
            title: 'Complete Activity?',
            html: `
                <div style="text-align: left;">
                    <p>Are you sure you want to mark "${name}" as completed?</p>
                    <p>Any outstanding balances will be automatically waived.</p>
                </div>
            `,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#e74c3c',
            cancelButtonColor: '#95a5a6',
            confirmButtonText: 'Yes, Complete & Waive',
            cancelButtonText: 'Cancel'
        });
        
        if (!result.isConfirmed) {
            return false;
        }
        
        // Complete the activity and waive balances
        await completeActivityAndWaiveBalances(id);
        
        const { error } = await _supabase
            .from('activities')
            .update({ 
                name, 
                description: desc, 
                total_budget: newBudget, 
                expected_completion_date: dueDate, 
                status: 'completed' 
            })
            .eq('id', id);
        
        if (error) { 
            Swal.fire('Error', error.message, 'error'); 
            return false; 
        }
        
        addNotification('🎉 Activity Completed', `"${name}" has been completed. Outstanding balances waived.`, 'success');
        queueToast('🎉 Activity Completed!', `"${name}" has been completed.`, 'success', 6000);
        
    } else {
        // Normal update without completion
        const { error } = await _supabase
            .from('activities')
            .update({ 
                name, 
                description: desc, 
                total_budget: newBudget, 
                expected_completion_date: dueDate, 
                status: status 
            })
            .eq('id', id);
        
        if (error) { 
            Swal.fire('Error', error.message, 'error'); 
            return false; 
        }
        
        // Recalculate shares if budget changed and activity is active
        if (status === 'active' && newBudget !== oldActivity?.totalBudget) {
            await recalculateActivityShares(id, newBudget);
            queueToast('💰 Budget Updated', `Activity budget changed. Shares recalculated.`, 'info', 4000);
        }
    }
    
    await loadData();
    await renderCurrentPage();
    
    Swal.fire('Updated!', 'Activity updated successfully', 'success');
    return true;
}

// RECALCULATE ACTIVITY SHARES - Updated
async function recalculateActivityShares(activityId, newBudget) {
    const members = await getFamilyMembers();
    
    // Get smart distribution based on positions
    const distribution = await calculateSmartDistribution(newBudget, activityId);
    
    // Update each member's amount
    for (const member of members) {
        const dist = distribution.distribution.find(d => d.memberId === member.id);
        const amountOwed = dist ? dist.amountOwed : 0;
        const status = amountOwed === 0 ? 'exempt' : 'unpaid';
        const notes = dist && !dist.shouldPay ? dist.reason : null;
        
        await _supabase
            .from('member_activities')
            .update({ 
                amount_owed: amountOwed,
                status: status,
                notes: notes
            })
            .eq('activity_id', activityId)
            .eq('member_id', member.id);
    }
}

// DELETE ACTIVITY
async function deleteActivity(id) {
    if (_currentRole !== 'admin') { 
        Swal.fire('Access Denied', 'Only administrators can delete activities', 'error'); 
        return; 
    }
    
    const result = await Swal.fire({ 
        title: 'Delete Activity?', 
        text: "This will delete all payment records for this activity!", 
        icon: 'warning', 
        showCancelButton: true, 
        confirmButtonColor: '#d33', 
        confirmButtonText: 'Delete' 
    });
    
    if (result.isConfirmed) {
        await _supabase.from('payments').delete().eq('activity_id', id);
        await _supabase.from('member_activities').delete().eq('activity_id', id);
        await _supabase.from('activities').delete().eq('id', id);
        
        await loadData();
        await renderCurrentPage();
        
        Swal.fire('Deleted!', 'Activity has been deleted.', 'success');
    }
}

// MANUALLY COMPLETE ACTIVITY
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
                    <hr>
                    <p><strong>The following members have outstanding balances that will be WAIVED:</strong></p>
                    <pre style="background: #fff3cd; padding: 10px; border-radius: 5px;">${memberList}</pre>
                    <p style="color: var(--danger);"><strong>⚠️ Warning:</strong> This action cannot be undone.</p>
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

// COMPLETE ACTIVITY AND WAIVE BALANCES
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
        const { data: memberActivity } = await _supabase
            .from('member_activities')
            .select('*')
            .eq('activity_id', activityId)
            .eq('member_id', member.memberId)
            .single();
        
        if (memberActivity && memberActivity.amount_owed > memberActivity.amount_paid) {
            const waivedAmount = memberActivity.amount_owed - memberActivity.amount_paid;
            
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
            
            const waivedMember = _familyMembers.find(m => m.id === member.memberId);
            await _supabase.from('payment_adjustments').insert({
                member_id: member.memberId,
                activity_id: activityId,
                adjustment_amount: waivedAmount,
                adjustment_type: 'waive',
                reason: `Auto-waived remaining balance of UGX ${waivedAmount.toLocaleString()} upon activity completion`,
                approved_by: _currentUser?.id || 0
            });
            
            queueToast('💰 Balance Waived', `${waivedMember?.name} had UGX ${waivedAmount.toLocaleString()} waived`, 'warning', 5000);
        }
    }
    
    // Mark activity as completed
    await _supabase
        .from('activities')
        .update({ status: 'completed' })
        .eq('id', activityId);
    
    // Send notifications
    addNotification('🎉 Activity Completed', `Activity has been marked as completed.`, 'success');
    
    return true;
}

// SHOW ACTIVITY DETAILS - Updated to show position-based info
async function showActivityDetails(activityId) {
    const activity = _activities.find(a => a.id === activityId);
    if (!activity) return;
    
    // Get member details with positions
    const positions = await getMemberPositions();
    
    let html = `
        <div style="margin-bottom: 15px;">
            <h3>${activity.name}</h3>
            <p>${activity.description || 'No description'}</p>
            <p><strong>💰 Budget:</strong> UGX ${(activity.totalBudget || 0).toLocaleString()}</p>
            <p><strong>📅 Due:</strong> ${new Date(activity.expectedCompletionDate).toLocaleDateString()}</p>
            <p><strong>Status:</strong> <span class="badge badge-${activity.status}">${activity.status}</span></p>
        </div>
        <h4 style="margin-top: 10px;">Member Payment Breakdown</h4>
        <div style="overflow-x: auto;">
            <table class="data-table" style="width: 100%;">
                <thead>
                    <tr>
                        <th>Member</th>
                        <th>Position</th>
                        <th>Payment Status</th>
                        <th>Owed (UGX)</th>
                        <th>Paid (UGX)</th>
                        <th>Balance (UGX)</th>
                        <th>Action</th>
                    </tr>
                </thead>
                <tbody>`;
    
    for (const mp of activity.memberPayments || []) {
        const balance = (mp.amount_owed || 0) - (mp.amount_paid || 0);
        const member = mp.family_members;
        const position = positions.find(p => p.id === member?.position_id);
        const positionName = position?.position_name || member?.member_type || 'Unknown';
        
        let paymentStatusClass = '';
        let paymentStatusText = '';
        if (mp.status === 'paid') {
            paymentStatusClass = 'paid-status';
            paymentStatusText = '✅ Paid';
        } else if (mp.status === 'partial') {
            paymentStatusClass = 'partial-status';
            paymentStatusText = '⚠️ Partial';
        } else if (mp.status === 'exempt') {
            paymentStatusClass = 'exempt-status';
            paymentStatusText = '🚫 Exempt';
        } else {
            paymentStatusClass = 'unpaid-status';
            paymentStatusText = '❌ Unpaid';
        }
        
        const owesMoney = balance > 0 && mp.status !== 'exempt';
        const isExempt = mp.status === 'exempt';
        
        html += `<tr>
            <td><strong>${member?.name || 'Unknown'}</strong></td>
            <td>${positionName}</td>
            <td class="${paymentStatusClass}">${paymentStatusText}</td>
            <td>UGX ${(mp.amount_owed || 0).toLocaleString()}</td>
            <td style="color: var(--success);">UGX ${(mp.amount_paid || 0).toLocaleString()}</td>
            <td class="${balance === 0 ? 'balance-zero' : 'balance-positive'}">UGX ${balance.toLocaleString()}</td>
            <td onclick="event.stopPropagation()">
                ${!isExempt && activity.status !== 'completed' ? `<button class="btn-adjust" onclick="openAdjustmentModal(${activity.id}, ${mp.member_id})">
                    <i class="fas fa-sliders-h"></i> Adjust
                </button>` : ''}
            </td>
        </tr>`;
    }
    
    html += `</tbody></table></div>`;
    
    // Add complete button if activity is not completed
    if (activity.status !== 'completed' && _currentRole === 'admin') {
        html += `
            <div style="margin-top: 20px; text-align: center;">
                <button class="btn-whatsapp" onclick="manuallyCompleteActivity(${activity.id})" style="background: var(--warning);">
                    <i class="fas fa-check-circle"></i> Complete Activity & Waive Balances
                </button>
            </div>
        `;
    }
    
    document.getElementById('activityDetailsContent').innerHTML = html;
    document.getElementById('activityDetailsModal').style.display = 'flex';
}

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