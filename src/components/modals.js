import { DOM_IDS } from '../config.js';

/**
 * Modals Component for managing modal dialogs
 */
class Modals {
  constructor() {
    // DOM elements
    this.createRoomModal = document.getElementById(DOM_IDS.CREATE_ROOM_MODAL);
    this.listenerActionModal = document.getElementById(DOM_IDS.LISTENER_ACTION_MODAL);
    
    // Setup event listeners
    this.setupEventListeners();
  }
  
  /**
   * Setup modal event listeners
   */
  setupEventListeners() {
    // Close button listeners
    document.querySelectorAll('.close-button').forEach(button => {
      button.addEventListener('click', (event) => {
        event.stopPropagation(); // Prevent other handlers from firing
        
        const modalId = button.dataset.modal;
        if (modalId && document.getElementById(modalId)) {
          this.hideModal(modalId);
        }
      });
    });
    
    // Click outside to close
    this.setupOutsideClickListeners();
    
    // Escape key to close modals
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        this.hideAllModals();
      }
    });
  }
  
  /**
   * Setup click outside listeners for all modals
   */
  setupOutsideClickListeners() {
    document.querySelectorAll('.modal').forEach(modal => {
      modal.addEventListener('click', (event) => {
        // Only close if click was directly on the modal background (not on modal content)
        if (event.target === modal) {
          this.hideModal(modal.id);
        }
      });
    });
  }
  
  /**
   * Show a modal by ID
   * @param {string} modalId - ID of modal to show
   * @param {Object} [options] - Additional options
   * @param {Function} [options.onShow] - Callback after modal is shown
   */
  showModal(modalId, options = {}) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    
    // Remove hide class to show modal
    modal.classList.remove('hide');
    
    // Ensure display is set to flex
    modal.style.display = 'flex';
    
    // Call onShow callback if provided
    if (options.onShow && typeof options.onShow === 'function') {
      options.onShow(modal);
    }
    
    // Return the modal element for chaining
    return modal;
  }
  
  /**
   * Hide a modal by ID
   * @param {string} modalId - ID of modal to hide
   * @param {Object} [options] - Additional options
   * @param {Function} [options.onHide] - Callback after modal is hidden
   */
  hideModal(modalId, options = {}) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    
    // Add hide class to hide modal
    modal.classList.add('hide');
    
    // Set display to none
    modal.style.display = 'none';
    
    // Call onHide callback if provided
    if (options.onHide && typeof options.onHide === 'function') {
      options.onHide(modal);
    }
    
    // Return the modal element for chaining
    return modal;
  }
  
  /**
   * Hide all modals
   */
  hideAllModals() {
    document.querySelectorAll('.modal').forEach(modal => {
      this.hideModal(modal.id);
    });
  }
  
  /**
   * Create a modal dynamically
   * @param {Object} options - Modal options
   * @param {string} options.id - ID for the modal
   * @param {string} options.title - Modal title
   * @param {string} options.content - Modal content HTML
   * @param {Array<Object>} [options.buttons] - Modal buttons
   * @returns {HTMLElement} - The created modal element
   */
  createModal({ id, title, content, buttons = [] }) {
    // Check if modal already exists
    let modal = document.getElementById(id);
    if (modal) {
      // Update existing modal
      const modalTitle = modal.querySelector('.modal-title');
      const modalContent = modal.querySelector('.modal-content');
      const modalFooter = modal.querySelector('.modal-footer');
      
      if (modalTitle) modalTitle.innerHTML = title;
      if (modalContent) modalContent.innerHTML = content;
      
      if (modalFooter && buttons.length) {
        modalFooter.innerHTML = '';
        buttons.forEach(button => {
          const btn = document.createElement('button');
          btn.className = button.class || 'btn-primary';
          btn.textContent = button.text;
          
          if (button.onClick) {
            btn.addEventListener('click', button.onClick);
          }
          
          modalFooter.appendChild(btn);
        });
      }
    } else {
      // Create new modal
      modal = document.createElement('div');
      modal.id = id;
      modal.className = 'modal hide';
      modal.style.position = 'fixed';
      modal.style.top = '0';
      modal.style.left = '0';
      modal.style.width = '100%';
      modal.style.height = '100%';
      modal.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
      modal.style.zIndex = '1000';
      modal.style.display = 'flex';
      modal.style.alignItems = 'center';
      modal.style.justifyContent = 'center';
      
      // Create modal content
      const modalContainer = document.createElement('div');
      modalContainer.className = 'modal-container';
      modalContainer.style.backgroundColor = '#1a1a22';
      modalContainer.style.borderRadius = '8px';
      modalContainer.style.width = '90%';
      modalContainer.style.maxWidth = '400px';
      modalContainer.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.3)';
      modalContainer.style.overflow = 'hidden';
      
      // Header
      const modalHeader = document.createElement('div');
      modalHeader.className = 'modal-header';
      modalHeader.style.padding = '15px';
      modalHeader.style.borderBottom = '1px solid #2a2a35';
      modalHeader.style.display = 'flex';
      modalHeader.style.justifyContent = 'space-between';
      modalHeader.style.alignItems = 'center';
      
      const modalTitle = document.createElement('h3');
      modalTitle.className = 'modal-title';
      modalTitle.innerHTML = title;
      modalTitle.style.margin = '0';
      modalTitle.style.color = 'white';
      modalTitle.style.fontSize = '18px';
      
      const closeButton = document.createElement('button');
      closeButton.className = 'close-button';
      closeButton.dataset.modal = id;
      closeButton.innerHTML = '&times;';
      closeButton.style.background = 'none';
      closeButton.style.border = 'none';
      closeButton.style.color = 'white';
      closeButton.style.fontSize = '24px';
      closeButton.style.cursor = 'pointer';
      closeButton.addEventListener('click', () => this.hideModal(id));
      
      modalHeader.appendChild(modalTitle);
      modalHeader.appendChild(closeButton);
      
      // Content
      const modalContent = document.createElement('div');
      modalContent.className = 'modal-content';
      modalContent.innerHTML = content;
      modalContent.style.padding = '15px';
      modalContent.style.color = 'white';
      
      // Footer with buttons
      const modalFooter = document.createElement('div');
      modalFooter.className = 'modal-footer';
      modalFooter.style.padding = '15px';
      modalFooter.style.display = 'flex';
      modalFooter.style.justifyContent = 'flex-end';
      modalFooter.style.gap = '10px';
      modalFooter.style.borderTop = '1px solid #2a2a35';
      
      buttons.forEach(button => {
        const btn = document.createElement('button');
        btn.className = button.class || 'btn-primary';
        btn.textContent = button.text;
        btn.style.padding = '8px 15px';
        btn.style.borderRadius = '4px';
        btn.style.cursor = 'pointer';
        btn.style.border = 'none';
        btn.style.fontSize = '14px';
        
        // Apply specific styles based on the button class
        if (button.class === 'btn-primary') {
          btn.style.backgroundColor = '#3662e3';
          btn.style.color = 'white';
        } else if (button.class === 'btn-secondary') {
          btn.style.backgroundColor = '#2a2a35';
          btn.style.color = 'white';
        } else if (button.class === 'btn-danger') {
          btn.style.backgroundColor = '#e53935';
          btn.style.color = 'white';
        }
        
        if (button.onClick) {
          btn.addEventListener('click', button.onClick);
        }
        
        modalFooter.appendChild(btn);
      });
      
      // Assemble modal
      modalContainer.appendChild(modalHeader);
      modalContainer.appendChild(modalContent);
      if (buttons.length) modalContainer.appendChild(modalFooter);
      
      modal.appendChild(modalContainer);
      
      // Add to document
      document.body.appendChild(modal);
      
      // Setup outside click listener
      modal.addEventListener('click', (event) => {
        if (event.target === modal) {
          this.hideModal(id);
        }
      });
    }
    
    return modal;
  }
  
  /**
   * Create and show a confirmation modal
   * @param {Object} options - Confirmation options
   * @param {string} options.title - Modal title
   * @param {string} options.message - Confirmation message
   * @param {Function} options.onConfirm - Function to call when confirmed
   * @param {Function} [options.onCancel] - Function to call when canceled
   * @param {string} [options.confirmText='Confirm'] - Text for confirm button
   * @param {string} [options.cancelText='Cancel'] - Text for cancel button
   * @param {string} [options.confirmClass='btn-primary'] - CSS class for confirm button
   * @param {string} [options.cancelClass='btn-secondary'] - CSS class for cancel button
   * @returns {HTMLElement} - The created modal element
   */
  showConfirmation({ 
    title = 'Confirm', 
    message, 
    onConfirm, 
    onCancel, 
    confirmText = 'Confirm', 
    cancelText = 'Cancel',
    confirmClass = 'btn-primary',
    cancelClass = 'btn-secondary'
  }) {
    const modalId = 'confirmation-modal';
    
    // Create buttons
    const buttons = [
      {
        text: cancelText,
        class: cancelClass,
        onClick: () => {
          this.hideModal(modalId);
          if (onCancel) onCancel();
        }
      },
      {
        text: confirmText,
        class: confirmClass,
        onClick: () => {
          this.hideModal(modalId);
          if (onConfirm) onConfirm();
        }
      }
    ];
    
    // Create modal
    const modal = this.createModal({
      id: modalId,
      title,
      content: `<p>${message}</p>`,
      buttons
    });
    
    // Show modal
    this.showModal(modalId);
    
    return modal;
  }
  
  /**
   * Show a simple alert modal
   * @param {Object} options - Alert options
   * @param {string} options.title - Alert title
   * @param {string} options.message - Alert message
   * @param {Function} [options.onClose] - Function to call when closed
   * @param {string} [options.closeText='OK'] - Text for close button
   * @returns {HTMLElement} - The created modal element
   */
  showAlert({ 
    title = 'Alert', 
    message, 
    onClose, 
    closeText = 'OK' 
  }) {
    const modalId = 'alert-modal';
    
    // Create buttons
    const buttons = [
      {
        text: closeText,
        class: 'btn-primary',
        onClick: () => {
          this.hideModal(modalId);
          if (onClose) onClose();
        }
      }
    ];
    
    // Create modal
    const modal = this.createModal({
      id: modalId,
      title,
      content: `<p>${message}</p>`,
      buttons
    });
    
    // Show modal
    this.showModal(modalId);
    
    return modal;
  }
}

// Create and export a singleton instance
const modals = new Modals();
export default modals; 