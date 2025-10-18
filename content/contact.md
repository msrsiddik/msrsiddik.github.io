+++
date = '2025-10-18T22:03:55+06:00'
draft = true
title = 'Contact Me'
markup = 'html'
+++

Get in touch with me - I'd love to hear from you!

<style>
  .contact-wrapper {
    max-width: 650px;
    margin: 3rem auto;
    padding: 0 1rem;
  }
  
  .contact-form {
    background: var(--bg-secondary, #ffffff);
    padding: 2.5rem;
    border-radius: 12px;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05), 
                0 10px 20px rgba(0, 0, 0, 0.08);
    border: 1px solid var(--border-color, rgba(0, 0, 0, 0.1));
  }
  
  .form-group {
    margin-bottom: 1.8rem;
  }
  
  .form-group label {
    display: block;
    margin-bottom: 0.6rem;
    font-weight: 600;
    color: var(--fg, #24292e);
    font-size: 1.1rem;
  }
  
  .contact-form input,
  .contact-form textarea {
    width: 100%;
    padding: 16px 18px;
    border: 2px solid var(--border-color, #d1d5da);
    border-radius: 8px;
    font-size: 1.1rem;
    font-family: inherit;
    box-sizing: border-box;
    transition: all 0.3s ease;
    background: var(--bg, #ffffff);
    color: var(--fg, #24292e);
  }
  
  .contact-form input::placeholder,
  .contact-form textarea::placeholder {
    color: var(--fg-secondary, #6a737d);
    opacity: 0.7;
    font-size: 1.05rem;
  }
  
  .contact-form input:focus,
  .contact-form textarea:focus {
    outline: none;
    border-color: var(--link, #0366d6);
    box-shadow: 0 0 0 3px var(--focus-ring, rgba(3, 102, 214, 0.15));
  }
  
  .contact-form textarea {
    resize: vertical;
    min-height: 160px;
    line-height: 1.7;
  }
  
  .submit-btn {
    width: 100%;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: #ffffff;
    padding: 16px 32px;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    font-size: 1.15rem;
    font-weight: 600;
    transition: all 0.3s ease;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  
  .submit-btn:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 7px 14px rgba(102, 126, 234, 0.4);
    background: linear-gradient(135deg, #5a67d8 0%, #6b46a0 100%);
  }
  
  .submit-btn:active {
    transform: translateY(0);
  }
  
  .submit-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    transform: none;
  }
  
  .form-icon {
    display: inline-block;
    margin-right: 8px;
    font-size: 1.2rem;
  }
  
  .alert {
    padding: 1rem 1.2rem;
    border-radius: 8px;
    margin-bottom: 1.5rem;
    font-size: 1rem;
    display: none;
    animation: slideDown 0.3s ease;
  }
  
  @keyframes slideDown {
    from {
      opacity: 0;
      transform: translateY(-10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  
  .alert.show {
    display: block;
  }
  
  .alert-success {
    background: #d4edda;
    color: #155724;
    border: 1px solid #c3e6cb;
  }
  
  .alert-error {
    background: #f8d7da;
    color: #721c24;
    border: 1px solid #f5c6cb;
  }
  
  /* Dark Mode */
  @media (prefers-color-scheme: dark) {
    .contact-form {
      background: rgba(255, 255, 255, 0.03);
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3), 
                  0 10px 20px rgba(0, 0, 0, 0.2);
      border: 1px solid rgba(255, 255, 255, 0.1);
    }
    
    .form-group label {
      color: #e1e4e8;
    }
    
    .contact-form input,
    .contact-form textarea {
      background: rgba(255, 255, 255, 0.05);
      border-color: rgba(255, 255, 255, 0.15);
      color: #e1e4e8;
    }
    
    .contact-form input::placeholder,
    .contact-form textarea::placeholder {
      color: #8b949e;
    }
    
    .contact-form input:focus,
    .contact-form textarea:focus {
      border-color: #58a6ff;
      box-shadow: 0 0 0 3px rgba(88, 166, 255, 0.2);
      background: rgba(255, 255, 255, 0.08);
    }
    
    .alert-success {
      background: rgba(40, 167, 69, 0.2);
      color: #7dffaf;
      border-color: rgba(40, 167, 69, 0.4);
    }
    
    .alert-error {
      background: rgba(220, 53, 69, 0.2);
      color: #ff7b8e;
      border-color: rgba(220, 53, 69, 0.4);
    }
  }
  
  body.colorscheme-dark .contact-form {
    background: rgba(255, 255, 255, 0.03);
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3), 
                0 10px 20px rgba(0, 0, 0, 0.2);
    border: 1px solid rgba(255, 255, 255, 0.1);
  }
  
  body.colorscheme-dark .form-group label {
    color: #e1e4e8;
  }
  
  body.colorscheme-dark .contact-form input,
  body.colorscheme-dark .contact-form textarea {
    background: rgba(255, 255, 255, 0.05);
    border-color: rgba(255, 255, 255, 0.15);
    color: #e1e4e8;
  }
  
  body.colorscheme-dark .contact-form input::placeholder,
  body.colorscheme-dark .contact-form textarea::placeholder {
    color: #8b949e;
  }
  
  body.colorscheme-dark .contact-form input:focus,
  body.colorscheme-dark .contact-form textarea:focus {
    border-color: #58a6ff;
    box-shadow: 0 0 0 3px rgba(88, 166, 255, 0.2);
    background: rgba(255, 255, 255, 0.08);
  }
  
  body.colorscheme-dark .alert-success {
    background: rgba(40, 167, 69, 0.2);
    color: #7dffaf;
    border-color: rgba(40, 167, 69, 0.4);
  }
  
  body.colorscheme-dark .alert-error {
    background: rgba(220, 53, 69, 0.2);
    color: #ff7b8e;
    border-color: rgba(220, 53, 69, 0.4);
  }
  
  @media (max-width: 600px) {
    .contact-form {
      padding: 1.5rem;
    }
  }
</style>

<div class="contact-wrapper">
  <div class="contact-form">
    <div class="alert alert-success" id="successMessage">
      <strong>✅ Success!</strong> Your message has been sent successfully. I'll get back to you soon!
    </div>
    <div class="alert alert-error" id="errorMessage">
      <strong>❌ Error!</strong> Something went wrong. Please try again later.
    </div>

    <form id="contactForm">
      
      <input type="hidden" name="access_key" value="6f095088-f64b-43e8-a819-69b63740f7f0">
      <input type="hidden" name="subject" value="New Contact Form Submission">
      <input type="hidden" name="from_name" value="Portfolio Contact Form">
      
      <!-- Honeypot Spam Protection -->
      <input type="checkbox" name="botcheck" class="hidden" style="display: none;">
      
      <div class="form-group">
        <label for="name"><span class="form-icon">👤</span>Name</label>
        <input type="text" id="name" name="name" placeholder="John Doe" required>
      </div>
      
      <div class="form-group">
        <label for="email"><span class="form-icon">📧</span>Email</label>
        <input type="email" id="email" name="email" placeholder="john@example.com" required>
      </div>
      
      <div class="form-group">
        <label for="message"><span class="form-icon">💬</span>Message</label>
        <textarea id="message" name="message" placeholder="Write your message here..." required></textarea>
      </div>
      
      <button type="submit" class="submit-btn" id="submitBtn">
        ✉️ Send Message
      </button>
    </form>
  </div>
</div>

<script>
const form = document.getElementById('contactForm');
const submitBtn = document.getElementById('submitBtn');
const successMessage = document.getElementById('successMessage');
const errorMessage = document.getElementById('errorMessage');

form.addEventListener('submit', async function(e) {
  e.preventDefault();
  
  // Hide previous messages
  successMessage.classList.remove('show');
  errorMessage.classList.remove('show');
  
  // Disable button and show loading
  submitBtn.disabled = true;
  submitBtn.innerHTML = '⏳ Sending...';
  
  // Get form data
  const formData = new FormData(form);
  
  try {
    const response = await fetch('https://api.web3forms.com/submit', {
      method: 'POST',
      body: formData
    });
    
    const data = await response.json();
    
    if (data.success) {
      // Show success message
      successMessage.classList.add('show');
      form.reset();
      
      // Scroll to success message
      successMessage.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      
      // Hide success message after 5 seconds
      setTimeout(() => {
        successMessage.classList.remove('show');
      }, 5000);
    } else {
      throw new Error('Form submission failed');
    }
  } catch (error) {
    // Show error message
    errorMessage.classList.add('show');
    errorMessage.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    
    // Hide error message after 5 seconds
    setTimeout(() => {
      errorMessage.classList.remove('show');
    }, 5000);
  } finally {
    // Re-enable button
    submitBtn.disabled = false;
    submitBtn.innerHTML = '✉️ Send Message';
  }
});
</script>