/* ============================================================
   ANKARA PALACE — FAQ PAGE CONTROLLER
   ============================================================ */

(function () {
  "use strict";

  const { $, clear, escapeHtml } = UI;

  const FAQS = [
    {
      q: "How do I create an account?",
      a: "Choose Sign Up in the navigation and complete the form. This preview keeps account information in this browser; connect a secure account service before using it with real customer data."
    },
    {
      q: "How do I place an order?",
      a: "Browse the Shop or a Collection, choose a fabric and quantity, and add it to your cart. You can combine products, then sign in, enter delivery details and review the full order before submitting it."
    },
    {
      q: "What fabrics does Ankara Palace sell?",
      a: "The catalogue includes Ankara, Aso-Oke, Adire, lace and other African print fabrics. Availability and product details are shown on each listing."
    },
    {
      q: "How is fabric pricing calculated?",
      a: "The product page shows the available unit and price. Some items may offer a bundle option. Your cart and checkout show the item totals and any delivery charge configured by the store."
    },
    {
      q: "What payment methods do you accept?",
      a: "Payment options and instructions are shown during checkout. In this browser preview, an uploaded receipt or order status is not automatically verified by a bank."
    },
    {
      q: "What are the delivery timelines?",
      a: "Delivery cost and timing depend on the destination and store settings. Confirm the estimate shown at checkout before placing an order; this preview does not arrange dispatch."
    },
    {
      q: "How do I track my order?",
      a: "Sign in and open your customer dashboard to view order records saved in this browser preview. Status changes here are not connected to a delivery provider."
    },
    {
      q: "What is your cancellation and returns policy?",
      a: "Review your cart and delivery details before submitting. For a real order, ask the store directly about cancellations, returns and refunds before purchase."
    },
    {
      q: "How can I contact customer support?",
      a: "Use the contact details listed on the Contact page. The message form in this preview saves locally and does not send a message to the store."
    },
    {
      q: "Is my payment information secure?",
      a: "This preview does not process card payments. It uses browser storage and is not connected to a secure production payment or account service. Do not enter sensitive payment details here."
    }
  ];

  function render() {
    const mount = $("#faq-list");
    if (!mount) return;
    clear(mount);

    FAQS.forEach((item, i) => {
      const node = document.createElement("div");
      node.className = "faq-item";
      node.innerHTML = `
        <button type="button" class="faq-question" aria-expanded="false" aria-controls="faq-answer-${i}">
          <span>${escapeHtml(item.q)}</span>
          <i class="fa-solid fa-chevron-down"></i>
        </button>
        <div class="faq-answer" id="faq-answer-${i}">${escapeHtml(item.a)}</div>
      `;
      const btn = node.querySelector(".faq-question");
      btn.addEventListener("click", () => {
        const open = node.classList.toggle("is-open");
        btn.setAttribute("aria-expanded", String(open));
      });
      mount.appendChild(node);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", render);
  } else {
    render();
  }
})();
