/**
 * Host Service Agreement — single source for signing + PDF generation.
 * Version bump when content changes.
 */

export const HOST_AGREEMENT_VERSION = "v1.0";

/** Plain full text for expert app display (matches PDF body order). */
export const HOST_AGREEMENT_FULL_TEXT = `HOST SERVICE AGREEMENT

1. SCOPE OF SERVICES
The Host agrees to provide online hosting services on the Platform, which may include but is not limited to live video sessions, audio calls, chat interactions, and other forms of digital engagement with users of the Platform.

2. CONTENT POLICY AND STRICT PROHIBITIONS
IMPORTANT: The following content is STRICTLY PROHIBITED on the Platform:
a) Nudity of any kind - partial or full
b) Adult content, sexually explicit material, or suggestive behaviour
c) Pornographic material or links to such content
d) Sexual solicitation or offers of sexual services
e) Obscene, vulgar, or indecent language or gestures
f) Harassment, abuse, or threatening behaviour
g) Hate speech, discrimination, or content promoting violence
h) Illegal activities or content violating Indian law
i) Any content that violates the Information Technology Act, 2000 and its amendments
CONSEQUENCE: Violation of this content policy will result in IMMEDIATE account termination, forfeiture of pending payments, and potential legal action.

3. PERSONAL INFORMATION AND LIABILITY DISCLAIMER
3.1 The Host acknowledges and understands that sharing personal information with users is done entirely at the Host's own risk and discretion.
3.2 Personal information includes but is not limited to: full name, address, phone number, email address, social media handles, bank details, photographs, family information, or any other identifying information.
3.3 DISCLAIMER: The Company shall NOT be held responsible or liable for any mishappening, harm, damage, loss, harassment, stalking, fraud, identity theft, or any other adverse consequence that may arise from the Host sharing personal information with users.
3.4 The Host is strongly advised NOT to share any personal or sensitive information with users under any circumstances.

4. PLATFORM SAFETY FEATURES
For the protection and safety of Hosts, the Platform has implemented the following security measures:
4.1 Screenshot Blocking: Users are technically prevented from taking screenshots during sessions.
4.2 Screen Recording Prevention: Users are technically prevented from recording video during sessions.
4.3 While these measures are in place, the Company cannot guarantee 100% prevention of all recording methods and shall not be liable for any circumvention of these features through external means.

5. PAYMENT TERMS AND CONDITIONS
5.1 Payment Structure: The Host shall be compensated on a per-minute session basis as determined by the Platform.
5.2 Payment Frequency: Payments shall be processed and disbursed on a WEEKLY basis through the Platform's automated payment system.
5.3 Bonuses: The Host may be eligible for performance-based bonuses as per the Platform's bonus structure, which may be modified from time to time at the Company's discretion.
5.4 Payment Method: Payments will be made via bank transfer/UPI to the account details provided by the Host.
5.5 Tax Responsibility: The Host is solely responsible for all applicable taxes on their earnings. The Company may deduct TDS as per applicable Indian tax laws.
5.6 Payment Forfeiture: Pending payments may be forfeited in case of violation of Platform policies or termination for cause.

6. VOLUNTARY PARTICIPATION
6.1 The Host hereby confirms and acknowledges that they are joining the Platform and providing services of their own free will and volition, without any coercion, undue influence, or pressure.
6.2 The Host has read, understood, and agrees to all terms and conditions outlined in this Agreement.
6.3 The Host is free to discontinue their services at any time by providing written notice to the Company.

7. ELIGIBILITY REQUIREMENTS
The Host represents and warrants that:
j) They are at least 18 years of age
k) They are legally competent to enter into this Agreement
l) All information provided to the Company is true, accurate, and complete
m) They have valid government-issued identification
n) They have valid bank account details for receiving payments

8. CONFIDENTIALITY
8.1 The Host agrees to maintain strict confidentiality regarding all proprietary information of the Company, including but not limited to business strategies, user data, payment structures, and internal processes.
8.2 The Host shall not disclose any confidential information to third parties without prior written consent from the Company.

9. INTELLECTUAL PROPERTY
9.1 All intellectual property rights related to the Platform, including trademarks, logos, software, and content, remain the exclusive property of the Company.
9.2 The Host shall not use the Company's intellectual property for any purpose other than performing services under this Agreement.

10. TERMINATION
10.1 Either party may terminate this Agreement at any time with written notice.
10.2 The Company reserves the right to immediately terminate this Agreement without notice in case of violation of any terms, including but not limited to content policy violations.
10.3 Upon termination, the Host shall immediately cease all activities on the Platform and return any Company property if applicable.

11. INDEMNIFICATION
The Host agrees to indemnify and hold harmless the Company, its directors, officers, employees, and agents from and against any and all claims, damages, losses, liabilities, costs, and expenses arising out of or related to the Host's breach of this Agreement, violation of any law, or any claim made by a third party due to or arising out of the Host's actions on the Platform.

12. DISPUTE RESOLUTION AND GOVERNING LAW
12.1 This Agreement shall be governed by and construed in accordance with the laws of India.
12.2 Any disputes arising out of or in connection with this Agreement shall first be attempted to be resolved through amicable negotiation.
12.3 If negotiation fails, disputes shall be subject to the exclusive jurisdiction of courts in the applicable territory in India as determined by the Company.

13. MISCELLANEOUS PROVISIONS
13.1 Entire Agreement: This Agreement constitutes the entire agreement between the parties and supersedes all prior agreements, representations, and understandings.
13.2 Amendment: The Company reserves the right to modify these terms at any time. Continued use of the Platform after modifications constitutes acceptance of the new terms.
13.3 Severability: If any provision of this Agreement is found to be invalid or unenforceable, the remaining provisions shall continue in full force and effect.
13.4 Waiver: Failure to enforce any provision shall not constitute a waiver of that provision or any other provision.
13.5 Independent Contractor: The Host is an independent contractor and not an employee of the Company. This Agreement does not create an employer-employee relationship.

ACKNOWLEDGMENT AND ACCEPTANCE
By signing below, I acknowledge that:
1. I have read and understood all terms and conditions of this Agreement.
2. I am joining the Platform of my own free will.
3. I agree to strictly comply with the content policy prohibiting nudity and adult content.
4. I understand that the Company is not liable for any consequences arising from my sharing of personal information.
5. I am at least 18 years of age and legally competent to enter into this Agreement.
6. All information provided by me is true and accurate.
`;

/** Structured sections for PDF rendering */
export const HOST_AGREEMENT_SECTIONS = [
  { title: "1. SCOPE OF SERVICES", body: `The Host agrees to provide online hosting services on the Platform, which may include but is not limited to live video sessions, audio calls, chat interactions, and other forms of digital engagement with users of the Platform.` },
  { title: "2. CONTENT POLICY AND STRICT PROHIBITIONS", body: `IMPORTANT: The following content is STRICTLY PROHIBITED on the Platform:
a) Nudity of any kind - partial or full
b) Adult content, sexually explicit material, or suggestive behaviour
c) Pornographic material or links to such content
d) Sexual solicitation or offers of sexual services
e) Obscene, vulgar, or indecent language or gestures
f) Harassment, abuse, or threatening behaviour
g) Hate speech, discrimination, or content promoting violence
h) Illegal activities or content violating Indian law
i) Any content that violates the Information Technology Act, 2000 and its amendments
CONSEQUENCE: Violation of this content policy will result in IMMEDIATE account termination, forfeiture of pending payments, and potential legal action.` },
  { title: "3. PERSONAL INFORMATION AND LIABILITY DISCLAIMER", body: `3.1 The Host acknowledges and understands that sharing personal information with users is done entirely at the Host's own risk and discretion.
3.2 Personal information includes but is not limited to: full name, address, phone number, email address, social media handles, bank details, photographs, family information, or any other identifying information.
3.3 DISCLAIMER: The Company shall NOT be held responsible or liable for any mishappening, harm, damage, loss, harassment, stalking, fraud, identity theft, or any other adverse consequence that may arise from the Host sharing personal information with users.
3.4 The Host is strongly advised NOT to share any personal or sensitive information with users under any circumstances.` },
  { title: "4. PLATFORM SAFETY FEATURES", body: `4.1 Screenshot Blocking: Users are technically prevented from taking screenshots during sessions.
4.2 Screen Recording Prevention: Users are technically prevented from recording video during sessions.
4.3 While these measures are in place, the Company cannot guarantee 100% prevention of all recording methods and shall not be liable for any circumvention of these features through external means.` },
  { title: "5. PAYMENT TERMS AND CONDITIONS", body: `5.1 Payment Structure: The Host shall be compensated on a per-minute session basis as determined by the Platform.
5.2 Payment Frequency: Payments shall be processed and disbursed on a WEEKLY basis through the Platform's automated payment system.
5.3 Bonuses: The Host may be eligible for performance-based bonuses as per the Platform's bonus structure.
5.4 Payment Method: Payments will be made via bank transfer/UPI to the account details provided by the Host.
5.5 Tax Responsibility: The Host is solely responsible for all applicable taxes on their earnings. The Company may deduct TDS as per applicable Indian tax laws.
5.6 Payment Forfeiture: Pending payments may be forfeited in case of violation of Platform policies or termination for cause.` },
  { title: "6. VOLUNTARY PARTICIPATION", body: `6.1 The Host hereby confirms and acknowledges that they are joining the Platform and providing services of their own free will and volition, without any coercion, undue influence, or pressure.
6.2 The Host has read, understood, and agrees to all terms and conditions outlined in this Agreement.
6.3 The Host is free to discontinue their services at any time by providing written notice to the Company.` },
  { title: "7. ELIGIBILITY REQUIREMENTS", body: `The Host represents and warrants that they are at least 18 years of age, legally competent, all information provided is true and accurate, they have valid government-issued identification, and valid bank account details for receiving payments.` },
  { title: "8. CONFIDENTIALITY", body: `8.1 The Host agrees to maintain strict confidentiality regarding all proprietary information of the Company.
8.2 The Host shall not disclose any confidential information to third parties without prior written consent from the Company.` },
  { title: "9. INTELLECTUAL PROPERTY", body: `9.1 All intellectual property rights related to the Platform remain the exclusive property of the Company.
9.2 The Host shall not use the Company's intellectual property for any purpose other than performing services under this Agreement.` },
  { title: "10. TERMINATION", body: `10.1 Either party may terminate this Agreement at any time with written notice.
10.2 The Company reserves the right to immediately terminate this Agreement without notice in case of violation of any terms.
10.3 Upon termination, the Host shall immediately cease all activities on the Platform.` },
  { title: "11. INDEMNIFICATION", body: `The Host agrees to indemnify and hold harmless the Company, its directors, officers, employees, and agents from any claims arising out of the Host's breach of this Agreement or violation of law.` },
  { title: "12. DISPUTE RESOLUTION AND GOVERNING LAW", body: `12.1 Governed by the laws of India.
12.2 Disputes shall first be resolved through amicable negotiation.
12.3 If negotiation fails, disputes shall be subject to the exclusive jurisdiction of courts in India as applicable.` },
  { title: "13. MISCELLANEOUS PROVISIONS", body: `13.1 Entire Agreement. 13.2 Amendment. 13.3 Severability. 13.4 Waiver. 13.5 Independent Contractor.` },
  { title: "ACKNOWLEDGMENT AND ACCEPTANCE", body: `By signing digitally, the Host acknowledges the numbered acceptance points as confirmed via checkboxes at signing.` },
];
