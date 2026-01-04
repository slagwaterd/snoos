import { smartAICall, logActivity } from './ai.js';
import { resend } from './resend.js';
import { readData, writeData, appendData } from './storage.js';
import dns from 'dns/promises';

class CampaignRunner {
    constructor() {
        this.activeCampaigns = new Map(); // Store abort controllers
    }

    async start(campaignId) {
        if (this.activeCampaigns.has(campaignId)) {
            console.log(`[Runner] Campaign ${campaignId} is already running.`);
            return;
        }

        const controller = new AbortController();
        this.activeCampaigns.set(campaignId, controller);

        console.log(`[Runner] Starting campaign: ${campaignId}`);
        this.runLoop(campaignId, controller.signal);
    }

    async pause(campaignId) {
        if (this.activeCampaigns.has(campaignId)) {
            console.log(`[Runner] Pausing campaign: ${campaignId}`);
            this.activeCampaigns.get(campaignId).abort();
            this.activeCampaigns.delete(campaignId);

            const campaigns = await readData('campaigns');
            const index = campaigns.findIndex(c => c.id === campaignId);
            if (index !== -1) {
                campaigns[index].status = 'paused';
                campaigns[index].updatedAt = new Date().toISOString();
                await writeData('campaigns', campaigns);
            }
        }
    }

    async stop(campaignId) {
        this.pause(campaignId);
        // Clear progress if needed, but usually we just pause/reset.
    }

    async runLoop(campaignId, signal) {
        try {
            while (!signal.aborted) {
                const campaigns = await readData('campaigns');
                const campaignIndex = campaigns.findIndex(c => c.id === campaignId);

                if (campaignIndex === -1) {
                    console.error(`[Runner] Campaign ${campaignId} not found.`);
                    this.activeCampaigns.delete(campaignId);
                    return;
                }

                const campaign = campaigns[campaignIndex];

                // If campaign was paused/stopped elsewhere
                if (campaign.status === 'paused' || campaign.status === 'stopped' || campaign.status === 'completed') {
                    console.log(`[Runner] Campaign ${campaignId} is in status: ${campaign.status}. Stopping runner.`);
                    this.activeCampaigns.delete(campaignId);
                    return;
                }

                const recipients = campaign.recipients || [];
                const currentIndex = campaign.currentIndex || 0;

                if (currentIndex >= recipients.length) {
                    console.log(`[Runner] Campaign ${campaignId} completed.`);
                    campaigns[campaignIndex].status = 'completed';
                    campaigns[campaignIndex].updatedAt = new Date().toISOString();
                    await writeData('campaigns', campaigns);
                    this.activeCampaigns.delete(campaignId);
                    return;
                }

                const recipient = recipients[currentIndex];
                const settings = await readData('settings');
                const defaultSender = settings.defaultSender || 'info@knowyourvip.com';
                const senderName = settings.senderName || 'S-MAILER';
                const signature = settings.signature || '';

                // Load agent
                let agent = null;
                if (campaign.agentId) {
                    const agents = await readData('agents');
                    agent = agents.find(a => a.id === campaign.agentId);
                }

                console.log(`[Runner] Processing ${currentIndex + 1}/${recipients.length}: ${recipient.email}`);

                // ═══════════════════════════════════════════════════════════════
                // STRICT EMAIL VALIDATOR - Must pass before any send attempt
                // ═══════════════════════════════════════════════════════════════
                const emailLocal = recipient.email.split('@')[0].toLowerCase();
                const emailDomainPart = recipient.email.split('@')[1]?.toLowerCase();
                let emailScore = 100;
                const emailIssues = [];

                // 1. BASIC FORMAT CHECK
                if (!recipient.email.includes('@') || !emailDomainPart) {
                    emailScore = 0;
                    emailIssues.push('Invalid email format');
                }

                // 2. BAD PREFIX CHECK (titles, generic words)
                const badPrefixes = [
                    'general.', 'manager.', 'director.', 'hotel.', 'hospitality.',
                    'ervaren.', 'seasoned.', 'cluster.', 'founder.', 'vice.',
                    'senior.', 'people-centric.', 'commercial.', 'brand.', 'high.',
                    'experience.', 'restaurant.', 'assistent.', 'nh.', 'mercure.',
                    'avani.', 'accountmanager.', 'gm.', 'agm.', 'ceo.', 'cfo.',
                    'hr.', 'it.', 'pr.', 'sales.', 'marketing.', 'info.', 'contact.',
                    'reservations.', 'front.', 'back.', 'f&b.', 'food.', 'revenue.',
                    'owner.', 'president.', 'chef.', 'executive.', 'managing.',
                    'area.', 'regional.', 'corporate.', 'head.', 'chief.'
                ];
                for (const prefix of badPrefixes) {
                    if (emailLocal.startsWith(prefix)) {
                        emailScore -= 60;
                        emailIssues.push(`Bad prefix: ${prefix}`);
                        break;
                    }
                }

                // 3. BAD SUFFIX CHECK (titles after name)
                const badSuffixes = ['.mba', '.rm', '.rt', '.phd', '.msc', '.bsc', '.ing', '.ir', '.dr', '.prof'];
                for (const suffix of badSuffixes) {
                    if (emailLocal.endsWith(suffix)) {
                        emailScore -= 50;
                        emailIssues.push(`Title suffix: ${suffix}`);
                        break;
                    }
                }

                // 4. LOCATION/COUNTRY IN EMAIL
                if (/nederland|duitsland|belgie|belgium|zwitserland|switzerland|frankrijk|france|armenie|tunesie|jordanie|itali[eë]|spain|germany|austria|europe|metropolitan|continent/i.test(emailLocal)) {
                    emailScore -= 70;
                    emailIssues.push('Contains location name');
                }

                // 5. TITLE WORDS IN LOCAL PART
                if (/general|manager|director|hospitality|cluster|founder|senior|commercial|experience|president|executive|specialist|coordinator|supervisor|assistant|intern/i.test(emailLocal)) {
                    emailScore -= 50;
                    emailIssues.push('Contains job title');
                }

                // 6. WEIRD FORMAT CHECKS
                if (/^[a-z]{1,2}\./i.test(emailLocal)) {
                    emailScore -= 40;
                    emailIssues.push('Starts with 1-2 letters (likely abbreviation)');
                }
                if (/^\d/.test(emailLocal)) {
                    emailScore -= 50;
                    emailIssues.push('Starts with number');
                }
                if (/[,\s]/.test(recipient.email)) {
                    emailScore -= 80;
                    emailIssues.push('Contains comma or space');
                }
                if (/\.\./.test(recipient.email)) {
                    emailScore -= 80;
                    emailIssues.push('Contains double dots');
                }

                // 7. MUST LOOK LIKE A REAL NAME (firstname.lastname pattern)
                const hasNamePattern = /^[a-z]{2,15}\.[a-z]{2,20}@/i.test(recipient.email);
                const hasSingleName = /^[a-z]{3,15}@/i.test(recipient.email);
                if (!hasNamePattern && !hasSingleName) {
                    // Check if it at least looks reasonable
                    if (!/^[a-z\-\.]{4,}@/i.test(recipient.email)) {
                        emailScore -= 30;
                        emailIssues.push('Unusual name format');
                    }
                }

                // 8. KNOWN PROBLEMATIC DOMAINS
                const badDomains = ['quick.com', 'example.com', 'test.com', 'fake.com'];
                if (badDomains.includes(emailDomainPart)) {
                    emailScore -= 100;
                    emailIssues.push('Known bad domain');
                }

                // Calculate final verdict
                const emailIsValid = emailScore >= 50;

                console.log(`[Runner] Email validation: ${recipient.email} | Score: ${emailScore} | Valid: ${emailIsValid}`);
                if (emailIssues.length > 0) {
                    console.log(`[Runner] Issues: ${emailIssues.join(', ')}`);
                }

                // SKIP if email doesn't pass validation
                if (!emailIsValid) {
                    console.log(`[Runner] ❌ BLOCKED: ${recipient.email} (score: ${emailScore})`);
                    if (!campaigns[campaignIndex].logs) campaigns[campaignIndex].logs = [];
                    campaigns[campaignIndex].logs.unshift({
                        timestamp: new Date().toISOString(),
                        recipient: recipient.email,
                        status: 'blocked',
                        error: `Email validation failed (score: ${emailScore}): ${emailIssues.join(', ')}`
                    });
                    campaigns[campaignIndex].currentIndex = currentIndex + 1;
                    await writeData('campaigns', campaigns);
                    await delay(200); // Quick skip
                    continue;
                }



                // MX Record Check - validate email domain before sending
                const emailDomain = recipient.email.split('@')[1];
                let skipDueToMX = false;

                // Known good domains that we don't need to check
                const trustedDomains = ['gmail.com', 'outlook.com', 'hotmail.com', 'yahoo.com', 'marriott.com', 'hilton.com', 'accor.com', 'ihg.com', 'hyatt.com', 'radissonhotels.com', 'vfrb.nl', 'westcordhotels.nl', 'postillionhotels.com', 'bilderberg.nl', 'fletcher.nl', 'carlton.nl', 'nh-hotels.com'];

                if (!trustedDomains.includes(emailDomain.toLowerCase())) {
                    try {
                        const mxRecords = await dns.resolveMx(emailDomain);
                        if (!mxRecords || mxRecords.length === 0) {
                            skipDueToMX = true;
                            console.log(`[Runner] ❌ Confirmed no MX records for ${emailDomain}`);
                        } else {
                            console.log(`[Runner] ✅ MX verified for ${emailDomain}`);
                        }
                    } catch (mxErr) {
                        // Only skip on ENOTFOUND (domain doesn't exist) or ENODATA (no MX records)
                        if (mxErr.code === 'ENOTFOUND' || mxErr.code === 'ENODATA') {
                            skipDueToMX = true;
                            console.log(`[Runner] ❌ Domain invalid: ${emailDomain} (${mxErr.code})`);
                        } else {
                            // DNS timeout or other error - proceed anyway
                            console.log(`[Runner] ⚠️ MX check inconclusive for ${emailDomain}, proceeding anyway`);
                        }
                    }
                } else {
                    console.log(`[Runner] ✅ Trusted domain: ${emailDomain}`);
                }

                if (skipDueToMX) {
                    console.log(`[Runner] ❌ Skipping ${recipient.email} - Invalid domain`);
                    if (!campaigns[campaignIndex].logs) campaigns[campaignIndex].logs = [];
                    campaigns[campaignIndex].logs.unshift({
                        timestamp: new Date().toISOString(),
                        recipient: recipient.email,
                        status: 'mx_failed',
                        error: `Invalid domain: ${emailDomain}`
                    });
                    campaigns[campaignIndex].currentIndex = currentIndex + 1;
                    await writeData('campaigns', campaigns);
                    await delay(1000);
                    continue;
                }

                try {
                    let finalSubject = campaign.template?.subject || '';
                    let finalBody = campaign.template?.content || '';

                    // AI Personalization
                    if (campaign.agentId) {
                        let prompt = `### PERSONA
${agent?.definition}

### RECIPIENT DATA (Use ALL of this naturally in the email)
- Full Name: ${recipient.name}
- Hotel/Company: ${recipient.company}
- Job Title: ${recipient.title}
- Location: ${recipient.location}
- Email: ${recipient.email}
- Raw Context: ${JSON.stringify(recipient._raw || {}, null, 2)}

### SUBJECT LINE RULES (CRITICAL)
Your subject must follow this formula: [Operational friction] + [time moment]
NO solutions, NO promises, NO consulting-speak.

✅ GOOD EXAMPLES:
- "Wat pas na vertrek duidelijk wordt"
- "Wanneer VIP-herkenning niet vooraf geborgd is"
- "Een operationele blinde vlek vóór check-in"
- "An Operational Blind Spot in VIP Recognition"
- "Waar VIP-erkenning operationeel wringt"

❌ FORBIDDEN in subjects:
- "Optimalisatie" / "Optimization" 
- Project-speak like "bij [Hotel Name]" at the end
- Thought leadership terms like "Operational Empathy"

### EMAIL BODY RULES
1. GREETING: Vary between "Beste", "Dag", "Hallo", "Goedemiddag" + first name. NOT always "Beste".
2. STRUCTURE: Exactly 3 short paragraphs, each separated by DOUBLE line break (<br/><br/>):
   - Paragraph 1: Greeting + concrete operational friction
   - Paragraph 2: The consequence (loss of control)
   - Paragraph 3: A single question as CTA (this is where you END)
3. MENTION "${recipient.company}" naturally in paragraph 1 or 2.
4. TONE: Senior consultant observing. Zero sales, zero fluff.
5. LANGUAGE: Dutch if NL/BE. German if DACH. French if FR. Otherwise English.
6. ENDING: The email ends EXACTLY on the question. NO closing, NO signature, NO name. The question mark is the last character.

### OUTPUT FORMAT (use <br/><br/> between paragraphs for visual spacing)
Respond with ONLY a valid JSON object:
{
  "subject": "Subject following the friction + time moment formula",
  "content": "Greeting,<br/><br/>Friction paragraph.<br/><br/>Consequence paragraph.<br/><br/>Question?"
}`;

                        let attempts = 0;
                        let validated = false;
                        let personalized = null;

                        while (attempts < 2 && !validated) {
                            attempts++;
                            console.log(`[Runner] AI generation attempt ${attempts}...`);

                            try {
                                const response = await smartAICall('research_synthesis', [{ role: 'user', content: prompt }], { jsonMode: true });
                                console.log(`[Runner] AI response received, parsing JSON...`);

                                try {
                                    personalized = JSON.parse(response.content);
                                } catch (parseErr) {
                                    console.error(`[Runner] JSON parse error:`, parseErr.message);
                                    console.log(`[Runner] Raw response:`, response.content?.substring(0, 500));
                                    // Try to extract JSON from response
                                    const jsonMatch = response.content?.match(/\{[\s\S]*\}/);
                                    if (jsonMatch) {
                                        personalized = JSON.parse(jsonMatch[0]);
                                        console.log(`[Runner] Extracted JSON successfully`);
                                    } else {
                                        throw new Error('Could not parse AI response as JSON');
                                    }
                                }

                                // VALIDATION PASS
                                console.log(`[Runner] Validating generated email...`);
                                const validationPrompt = `You are a Quality Assurance reviewer. Check if this email meets ALL requirements:

EMAIL TO VALIDATE:
Subject: ${personalized.subject}
Content: ${personalized.content}

REQUIREMENTS CHECKLIST:
1. ✅/❌ SUBJECT: Does NOT contain "Optimalisatie"/"Optimization", does NOT end with "bij [Hotel]", follows friction + time formula
2. ✅/❌ GREETING: Starts with varied greeting (Beste/Dag/Hallo/Goedemiddag) + first name
3. ✅/❌ COMPANY: Mentions "${recipient.company}" naturally in the body
4. ✅/❌ LANGUAGE: Correct language (Dutch for NL/BE, German for DACH, French for FR)
5. ✅/❌ FORBIDDEN: No "exclusive", "experience", "atmosphere", "personal attention", "optimalisatie"
6. ✅/❌ ENDING: Last character is a question mark. NO closing phrase, NO signature, NO name after it.
7. ✅/❌ SPACING: Has paragraph breaks (<br/><br/>) between greeting, friction, and question

Respond with JSON: { "valid": true/false, "issues": ["list of issues if any"] }`;

                                const validationResponse = await smartAICall('research_synthesis', [{ role: 'user', content: validationPrompt }], { jsonMode: true });
                                let validation;
                                try {
                                    validation = JSON.parse(validationResponse.content);
                                } catch (vErr) {
                                    console.log(`[Runner] Validation parse failed, assuming valid`);
                                    validation = { valid: true };
                                }

                                if (validation.valid) {
                                    validated = true;
                                    console.log(`[Runner] ✅ Email validated on attempt ${attempts}`);
                                } else {
                                    console.log(`[Runner] ⚠️ Validation failed (attempt ${attempts}):`, validation.issues);
                                    prompt += `\n\n### PREVIOUS ATTEMPT FAILED VALIDATION\nFix these issues: ${validation.issues?.join(', ') || 'unknown'}`;
                                }
                            } catch (aiErr) {
                                console.error(`[Runner] AI call failed (attempt ${attempts}):`, aiErr.message);
                                // Don't throw - just continue trying or move to next recipient
                            }
                        }

                        if (!personalized) {
                            console.error(`[Runner] ❌ Failed to generate email for ${recipient.email}, skipping...`);
                            // Log and continue to next recipient
                            if (!campaigns[campaignIndex].logs) campaigns[campaignIndex].logs = [];
                            campaigns[campaignIndex].logs.unshift({
                                timestamp: new Date().toISOString(),
                                recipient: recipient.email,
                                status: 'ai_failed',
                                error: 'AI failed to generate email after all attempts'
                            });
                            campaigns[campaignIndex].currentIndex = currentIndex + 1;
                            await writeData('campaigns', campaigns);
                            continue; // Move to next recipient, don't stop!
                        }

                        finalSubject = personalized.subject;
                        finalBody = personalized.content;
                    } else {
                        // Tag replacement
                        const replaceAll = (str, obj) => str.replace(/\{\{name\}\}/g, obj.name || '').replace(/\{\{email\}\}/g, obj.email || '').replace(/\{\{company\}\}/g, obj.company || '');
                        finalSubject = replaceAll(finalSubject, recipient);
                        finalBody = replaceAll(finalBody, recipient).replace(/\n/g, '<br/>');
                    }

                    // signature check from agent config
                    const useSignature = agent?.emailConfig?.signature !== false;

                    // Wrap in basic HTML structure
                    const htmlContent = `
                        <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; line-height: 1.6; color: #1a1a1a; max-width: 600px; font-size: 16px;">
                            ${finalBody}
                            ${useSignature ? `
                            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 14px; color: #666;">
                                ${signature.replace(/\n/g, '<br/>')}
                            </div>` : ''}
                        </div>
                    `;

                    // Send via Resend
                    const { data, error } = await resend.emails.send({
                        from: `${senderName} <${defaultSender}>`,
                        to: [recipient.email],
                        subject: finalSubject,
                        html: htmlContent
                    });

                    if (error) throw error;

                    // Update campaign state
                    campaigns[campaignIndex].currentIndex = currentIndex + 1;
                    campaigns[campaignIndex].sentCount = (campaigns[campaignIndex].sentCount || 0) + 1;
                    campaigns[campaignIndex].updatedAt = new Date().toISOString();

                    if (!campaigns[campaignIndex].logs) campaigns[campaignIndex].logs = [];
                    campaigns[campaignIndex].logs.unshift({
                        timestamp: new Date().toISOString(),
                        recipient: recipient.email,
                        status: 'sent',
                        resendId: data.id
                    });
                    if (campaigns[campaignIndex].logs.length > 50) campaigns[campaignIndex].logs.pop();

                    await writeData('campaigns', campaigns);

                    // Log to global sent history
                    await appendData('sent', {
                        resendId: data.id,
                        from: defaultSender,
                        to: recipient.email,
                        subject: finalSubject,
                        html: htmlContent,
                        type: 'html',
                        status: 'sent',
                        batch: true,
                        campaignId: campaignId,
                        agentId: campaign.agentId || null
                    });

                } catch (err) {
                    console.error(`[Runner] Error sending to ${recipient.email}:`, err.message);

                    // Update campaign with error
                    campaigns[campaignIndex].currentIndex = currentIndex + 1;
                    campaigns[campaignIndex].updatedAt = new Date().toISOString();

                    if (!campaigns[campaignIndex].logs) campaigns[campaignIndex].logs = [];
                    campaigns[campaignIndex].logs.unshift({
                        timestamp: new Date().toISOString(),
                        recipient: recipient.email,
                        status: 'error',
                        error: err.message
                    });
                    if (campaigns[campaignIndex].logs.length > 50) campaigns[campaignIndex].logs.pop();

                    await writeData('campaigns', campaigns);
                }

                // Wait between sends (anti-spam / rate limit)
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        } catch (err) {
            console.error(`[Runner] Critical break in loop for ${campaignId}:`, err);
        }
    }
}

// Singleton instance with global preservation for HMR
const globalForRunner = global;
const runner = globalForRunner.campaignRunner || new CampaignRunner();

if (process.env.NODE_ENV !== 'production') {
    globalForRunner.campaignRunner = runner;
}

export default runner;
