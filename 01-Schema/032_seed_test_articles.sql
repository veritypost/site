-- ============================================================
-- Test content seed — 5 published articles + 12 quiz questions each
--
-- Safe to re-run: each INSERT uses ON CONFLICT (slug) DO NOTHING.
-- Each article title starts "Test:" and has slug prefix "test-"
-- so they are trivially greppable for cleanup:
--
--   DELETE FROM articles WHERE slug LIKE 'test-%';
--   (quizzes + quiz_attempts + reading_log + comments + bookmarks CASCADE)
--
-- Cover images use picsum.photos deterministic seeds so they are
-- stable across runs and don't require your own storage bucket.
-- ============================================================


-- ------------------------------------------------------------
-- Article 1 — Politics
-- ------------------------------------------------------------
INSERT INTO articles (
  title, slug, excerpt, body, cover_image_url, cover_image_alt,
  category_id, status, visibility, is_kids_safe, language,
  reading_time_minutes, word_count, moderation_status, published_at
) VALUES (
  'Test: Congressional Hearing on Federal Reserve Independence',
  'test-congressional-hearing-fed-independence',
  'Lawmakers pressed Fed Chair Jerome Powell on the central bank''s decision-making process as political pressure mounts over interest rate policy.',
  'Federal Reserve Chair Jerome Powell faced sharp questioning from members of the House Financial Services Committee this week over the independence of the central bank and its recent interest rate decisions.

The hearing, which lasted nearly four hours, covered topics ranging from inflation expectations to the Fed''s dual mandate of stable prices and maximum employment. Several lawmakers expressed concern that political pressure from the executive branch could compromise the Fed''s ability to set monetary policy based on economic data alone.

Powell reiterated the Fed''s commitment to its 2 percent inflation target and emphasized that the Federal Open Market Committee bases its decisions exclusively on incoming economic data. He declined to comment on specific political statements but noted that the Fed''s statutory independence has served the country well since the Federal Reserve Act of 1913.

Committee Chair Patrick McHenry raised the question of whether the Fed''s balance sheet, which grew substantially during the pandemic, has created inflationary pressure that persists today. Powell acknowledged that quantitative easing contributes to monetary conditions but noted that the balance sheet has been reduced significantly since peak levels in 2022.

Ranking member Maxine Waters focused her questions on the regional impact of rate decisions, particularly on housing affordability and small business lending. Powell responded that while the Fed considers the distributional effects of its policies, its tools are blunt and cannot target specific sectors or populations.

The hearing also touched on the Fed''s role in bank supervision following the 2023 failures of Silicon Valley Bank and Signature Bank. Powell defended the central bank''s post-failure review process and described ongoing changes to supervisory practices for banks in the $100 billion to $250 billion asset range.

Economists watching the hearing noted that Powell''s testimony broke little new ground on the near-term rate path. The Federal Open Market Committee meets next month, and most market participants expect the Fed to hold rates steady pending further data on inflation and the labor market.',
  'https://picsum.photos/seed/vpoltest1/1200/630',
  'Federal Reserve building',
  (SELECT id FROM categories WHERE slug = 'politics'),
  'published', 'public', false, 'en',
  4, 420, 'approved', now() - interval '2 hours'
) ON CONFLICT (slug) DO NOTHING;

-- Quiz pool for article 1
INSERT INTO quizzes (article_id, title, question_text, options, explanation, sort_order, is_active)
SELECT a.id, q.title, q.question_text, q.options::jsonb, q.explanation, q.sort_order, true
FROM articles a, (VALUES
  ('Q1','Who is the Fed Chair in this hearing?',
   '[{"text":"Jerome Powell","is_correct":true},{"text":"Janet Yellen","is_correct":false},{"text":"Ben Bernanke","is_correct":false},{"text":"Mary Daly","is_correct":false}]',
   'The article opens with Chair Jerome Powell facing the committee.', 1),
  ('Q2','Which committee held the hearing?',
   '[{"text":"House Financial Services","is_correct":true},{"text":"Senate Banking","is_correct":false},{"text":"House Ways and Means","is_correct":false},{"text":"Joint Economic","is_correct":false}]',
   'The hearing was held by the House Financial Services Committee.', 2),
  ('Q3','What is the Fed''s inflation target?',
   '[{"text":"2 percent","is_correct":true},{"text":"3 percent","is_correct":false},{"text":"4 percent","is_correct":false},{"text":"0 percent","is_correct":false}]',
   'Powell reiterated the 2 percent target.', 3),
  ('Q4','What year was the Federal Reserve Act passed?',
   '[{"text":"1913","is_correct":true},{"text":"1929","is_correct":false},{"text":"1946","is_correct":false},{"text":"1977","is_correct":false}]',
   'The article cites the Federal Reserve Act of 1913.', 4),
  ('Q5','Who is the Committee Chair mentioned?',
   '[{"text":"Patrick McHenry","is_correct":true},{"text":"Maxine Waters","is_correct":false},{"text":"Barney Frank","is_correct":false},{"text":"Jeb Hensarling","is_correct":false}]',
   'Patrick McHenry raised the balance-sheet question.', 5),
  ('Q6','Who is the ranking member mentioned?',
   '[{"text":"Maxine Waters","is_correct":true},{"text":"Patrick McHenry","is_correct":false},{"text":"Kevin McCarthy","is_correct":false},{"text":"Hakeem Jeffries","is_correct":false}]',
   'Waters focused on regional/housing impacts.', 6),
  ('Q7','What two banks failed in 2023?',
   '[{"text":"Silicon Valley Bank and Signature Bank","is_correct":true},{"text":"Wells Fargo and Chase","is_correct":false},{"text":"Bank of America and Citi","is_correct":false},{"text":"Goldman and Morgan Stanley","is_correct":false}]',
   'The article names SVB and Signature.', 7),
  ('Q8','What is the Fed''s dual mandate?',
   '[{"text":"Stable prices and maximum employment","is_correct":true},{"text":"Low rates and economic growth","is_correct":false},{"text":"Full employment and free trade","is_correct":false},{"text":"Price stability and strong dollar","is_correct":false}]',
   'Stable prices + maximum employment is the statutory dual mandate.', 8),
  ('Q9','Which asset-size range for banks did Powell discuss supervision changes for?',
   '[{"text":"$100B–$250B","is_correct":true},{"text":"Under $10B","is_correct":false},{"text":"Over $1T","is_correct":false},{"text":"$10B–$50B","is_correct":false}]',
   'Supervisory changes target the $100B–$250B tier.', 9),
  ('Q10','When did the Fed''s balance sheet peak?',
   '[{"text":"2022","is_correct":true},{"text":"2020","is_correct":false},{"text":"2024","is_correct":false},{"text":"2018","is_correct":false}]',
   'Powell said the balance sheet has been reduced since peak levels in 2022.', 10),
  ('Q11','How long did the hearing last?',
   '[{"text":"Nearly four hours","is_correct":true},{"text":"Under one hour","is_correct":false},{"text":"Six hours","is_correct":false},{"text":"Two days","is_correct":false}]',
   'The opening paragraph says nearly four hours.', 11),
  ('Q12','What do markets expect at the next FOMC meeting?',
   '[{"text":"Hold rates steady","is_correct":true},{"text":"Raise rates 50bp","is_correct":false},{"text":"Cut rates 25bp","is_correct":false},{"text":"Announce new QE","is_correct":false}]',
   'Most market participants expect a hold pending more data.', 12)
) AS q(title, question_text, options, explanation, sort_order)
WHERE a.slug = 'test-congressional-hearing-fed-independence';


-- ------------------------------------------------------------
-- Article 2 — Technology
-- ------------------------------------------------------------
INSERT INTO articles (
  title, slug, excerpt, body, cover_image_url, cover_image_alt,
  category_id, status, visibility, is_kids_safe, language,
  reading_time_minutes, word_count, moderation_status, published_at
) VALUES (
  'Test: EU Passes Comprehensive AI Act, Targeting High-Risk Systems',
  'test-eu-ai-act-high-risk',
  'The European Parliament approved the final text of the AI Act, introducing tiered obligations for AI systems based on risk category and banning certain use cases outright.',
  'The European Parliament this week approved the final text of the Artificial Intelligence Act, concluding nearly three years of negotiation and positioning the European Union as the first major jurisdiction to pass comprehensive AI regulation.

The legislation adopts a tiered approach, classifying AI systems into four risk categories: unacceptable, high, limited, and minimal. Unacceptable-risk systems — including social scoring by public authorities, real-time biometric identification in public spaces with narrow exceptions, and AI designed to exploit vulnerabilities of specific groups — are prohibited outright.

High-risk systems face the heaviest compliance burden. These include AI used in critical infrastructure, education admissions, employment decisions, essential public and private services, law enforcement, migration and border control, and administration of justice. Operators of high-risk systems must implement risk management, data governance, technical documentation, record-keeping, transparency, human oversight, and accuracy and robustness measures before deployment.

General-purpose AI models, including large language models, receive dedicated provisions. Models trained with more than 10^25 floating-point operations are deemed to pose systemic risk and face additional evaluation, adversarial testing, and incident-reporting obligations.

The AI Act takes effect in stages. Prohibitions on unacceptable-risk systems apply six months after entry into force. Governance rules and obligations for general-purpose AI begin at twelve months. The bulk of the Act, covering high-risk systems, applies at the 24-month mark. Full implementation is expected by mid-2026.

Penalties for non-compliance scale with company size and the severity of violation. Breaches of prohibited practices can reach 35 million euros or 7 percent of global annual turnover, whichever is higher. Other violations cap at 15 million euros or 3 percent of turnover.

Industry reaction has been mixed. Large technology firms have publicly accepted the framework while lobbying for implementation flexibility. European startups have raised concerns that compliance costs may disadvantage smaller players. Civil society groups broadly welcomed the Act but pushed for stricter limits on biometric surveillance.

The Act establishes a European AI Office to oversee general-purpose AI models and a European Artificial Intelligence Board for coordination with national authorities. Member states have responsibility for designating national competent authorities and enforcing the Act within their jurisdictions.',
  'https://picsum.photos/seed/vptechtest1/1200/630',
  'European Parliament building',
  (SELECT id FROM categories WHERE slug = 'technology'),
  'published', 'public', false, 'en',
  5, 460, 'approved', now() - interval '5 hours'
) ON CONFLICT (slug) DO NOTHING;

INSERT INTO quizzes (article_id, title, question_text, options, explanation, sort_order, is_active)
SELECT a.id, q.title, q.question_text, q.options::jsonb, q.explanation, q.sort_order, true
FROM articles a, (VALUES
  ('Q1','How many risk categories does the AI Act define?',
   '[{"text":"Four","is_correct":true},{"text":"Three","is_correct":false},{"text":"Five","is_correct":false},{"text":"Two","is_correct":false}]',
   'Unacceptable, high, limited, minimal.', 1),
  ('Q2','Which category is banned outright?',
   '[{"text":"Unacceptable-risk","is_correct":true},{"text":"High-risk","is_correct":false},{"text":"Limited-risk","is_correct":false},{"text":"Minimal-risk","is_correct":false}]',
   'Unacceptable-risk is prohibited.', 2),
  ('Q3','What FLOP threshold triggers systemic-risk GPAI rules?',
   '[{"text":"10^25","is_correct":true},{"text":"10^20","is_correct":false},{"text":"10^30","is_correct":false},{"text":"10^15","is_correct":false}]',
   'Models above 10^25 FLOPs trigger systemic-risk status.', 3),
  ('Q4','Max penalty for prohibited-practice breaches?',
   '[{"text":"35M EUR or 7% of turnover","is_correct":true},{"text":"10M EUR or 2% of turnover","is_correct":false},{"text":"50M EUR or 10% of turnover","is_correct":false},{"text":"Fixed 100M EUR","is_correct":false}]',
   '35M EUR or 7% — whichever is higher.', 4),
  ('Q5','When do high-risk rules fully apply?',
   '[{"text":"24 months after entry into force","is_correct":true},{"text":"6 months","is_correct":false},{"text":"12 months","is_correct":false},{"text":"36 months","is_correct":false}]',
   'High-risk obligations apply at the 24-month mark.', 5),
  ('Q6','Which body oversees general-purpose AI at EU level?',
   '[{"text":"European AI Office","is_correct":true},{"text":"ECB","is_correct":false},{"text":"ENISA","is_correct":false},{"text":"EIPO","is_correct":false}]',
   'The AI Office oversees GPAI.', 6),
  ('Q7','Which use case is specifically prohibited?',
   '[{"text":"Social scoring by public authorities","is_correct":true},{"text":"Fraud detection in banking","is_correct":false},{"text":"Medical imaging review","is_correct":false},{"text":"Code generation","is_correct":false}]',
   'Social scoring by public authorities is in the prohibited list.', 7),
  ('Q8','Approximate negotiation length?',
   '[{"text":"Nearly three years","is_correct":true},{"text":"Six months","is_correct":false},{"text":"A decade","is_correct":false},{"text":"One year","is_correct":false}]',
   'The article says nearly three years of negotiation.', 8),
  ('Q9','Which group raised concerns about compliance costs?',
   '[{"text":"European startups","is_correct":true},{"text":"The ECB","is_correct":false},{"text":"US Congress","is_correct":false},{"text":"NATO","is_correct":false}]',
   'Startups argued compliance could disadvantage smaller players.', 9),
  ('Q10','Max penalty for non-prohibited-practice violations?',
   '[{"text":"15M EUR or 3% of turnover","is_correct":true},{"text":"35M EUR or 7% of turnover","is_correct":false},{"text":"10M EUR or 5% of turnover","is_correct":false},{"text":"50M EUR or 10% of turnover","is_correct":false}]',
   'Other violations cap at 15M EUR or 3%.', 10),
  ('Q11','When do the bans on unacceptable-risk systems apply?',
   '[{"text":"6 months after entry into force","is_correct":true},{"text":"12 months","is_correct":false},{"text":"24 months","is_correct":false},{"text":"Immediately","is_correct":false}]',
   'Prohibitions activate at the 6-month mark.', 11),
  ('Q12','Which civil society demand is mentioned?',
   '[{"text":"Stricter limits on biometric surveillance","is_correct":true},{"text":"Relaxed startup rules","is_correct":false},{"text":"Tax cuts for AI firms","is_correct":false},{"text":"US alignment","is_correct":false}]',
   'Civil society pushed for tighter biometric limits.', 12)
) AS q(title, question_text, options, explanation, sort_order)
WHERE a.slug = 'test-eu-ai-act-high-risk';


-- ------------------------------------------------------------
-- Article 3 — Science
-- ------------------------------------------------------------
INSERT INTO articles (
  title, slug, excerpt, body, cover_image_url, cover_image_alt,
  category_id, status, visibility, is_kids_safe, language,
  reading_time_minutes, word_count, moderation_status, published_at
) VALUES (
  'Test: JWST Observations Reveal Unexpectedly Massive Early Galaxies',
  'test-jwst-early-galaxies',
  'New James Webb Space Telescope measurements suggest galaxies in the first 500 million years after the Big Bang were more massive than cosmological models had predicted.',
  'Observations from the James Webb Space Telescope published in a pair of peer-reviewed papers this month indicate that galaxies in the first 500 million years of cosmic history may have been substantially more massive than the prevailing cosmological models predict.

The studies analyzed spectra from nine galaxies with redshifts between z=7 and z=10, corresponding to a time when the universe was less than 700 million years old. Stellar mass estimates for several of these objects exceed 10^10 solar masses, which is close to the mass of the Milky Way today.

The finding is in tension with the standard Lambda-CDM cosmological model, under which gravitationally bound structures assemble gradually through hierarchical merging. If galaxies this massive existed so early, either star formation was far more efficient than current models assume, or the composition of dark matter differs from the cold dark matter framework.

Several alternative explanations remain open. The inferred stellar masses depend on assumptions about the initial mass function — the distribution of stellar masses formed from a gas cloud — and a top-heavy IMF in the early universe could reconcile the observations with standard cosmology. Stronger dust obscuration at high redshift could also cause observers to over-estimate luminosity and mass.

Lead author Dr. Ivo Labbé of Swinburne University of Technology emphasized that spectroscopic follow-up remains necessary. Several candidates in the initial photometric sample have since been re-characterized at lower redshift, reducing the statistical tension. But even after the revision, at least three of the original candidates remain unambiguously massive and early.

The debate has practical consequences for the next generation of astronomical surveys. Extremely Large Telescope facilities currently under construction are designed partly to resolve questions about early galaxy formation. If the JWST results hold up, they may reshape priorities for time allocation on those instruments.

Some theorists have proposed modifications to the dark matter model, including fuzzy dark matter and self-interacting dark matter, as possible resolutions. These alternatives have long-standing support from observations of galaxy-scale dynamics, but their compatibility with early-universe constraints remains an active area of research.',
  'https://picsum.photos/seed/vpscitest1/1200/630',
  'Distant galaxy captured by JWST',
  (SELECT id FROM categories WHERE slug = 'science'),
  'published', 'public', true, 'en',
  5, 440, 'approved', now() - interval '1 day'
) ON CONFLICT (slug) DO NOTHING;

INSERT INTO quizzes (article_id, title, question_text, options, explanation, sort_order, is_active)
SELECT a.id, q.title, q.question_text, q.options::jsonb, q.explanation, q.sort_order, true
FROM articles a, (VALUES
  ('Q1','Which telescope produced the observations?',
   '[{"text":"James Webb Space Telescope","is_correct":true},{"text":"Hubble Space Telescope","is_correct":false},{"text":"Kepler","is_correct":false},{"text":"Spitzer","is_correct":false}]',
   'JWST is the subject of the paper.', 1),
  ('Q2','Redshift range of the nine galaxies?',
   '[{"text":"z=7 to z=10","is_correct":true},{"text":"z=0.5 to z=2","is_correct":false},{"text":"z=12 to z=15","is_correct":false},{"text":"z=1 to z=3","is_correct":false}]',
   'The article specifies z=7 to z=10.', 2),
  ('Q3','Approximate universe age for these galaxies?',
   '[{"text":"Less than 700 million years old","is_correct":true},{"text":"1 billion years","is_correct":false},{"text":"5 billion years","is_correct":false},{"text":"13.7 billion years","is_correct":false}]',
   'Less than 700 million years.', 3),
  ('Q4','Stellar mass estimate that raised eyebrows?',
   '[{"text":"10^10 solar masses","is_correct":true},{"text":"10^5 solar masses","is_correct":false},{"text":"10^15 solar masses","is_correct":false},{"text":"10^2 solar masses","is_correct":false}]',
   'Close to Milky Way mass today.', 4),
  ('Q5','Which cosmological model is under tension?',
   '[{"text":"Lambda-CDM","is_correct":true},{"text":"Steady-state","is_correct":false},{"text":"MOND","is_correct":false},{"text":"Oscillating universe","is_correct":false}]',
   'Lambda-CDM predicts hierarchical merging.', 5),
  ('Q6','IMF stands for?',
   '[{"text":"Initial mass function","is_correct":true},{"text":"International Monetary Fund","is_correct":false},{"text":"Interstellar medium flux","is_correct":false},{"text":"Intergalactic molecular field","is_correct":false}]',
   'In astrophysics, Initial Mass Function.', 6),
  ('Q7','Lead author institution?',
   '[{"text":"Swinburne University of Technology","is_correct":true},{"text":"MIT","is_correct":false},{"text":"CERN","is_correct":false},{"text":"Caltech","is_correct":false}]',
   'Dr Ivo Labbé is at Swinburne.', 7),
  ('Q8','What follow-up observation is still needed?',
   '[{"text":"Spectroscopic confirmation","is_correct":true},{"text":"X-ray imaging","is_correct":false},{"text":"Radio detection","is_correct":false},{"text":"Neutrino counting","is_correct":false}]',
   'Spectroscopic follow-up.', 8),
  ('Q9','Name one alternative dark matter model mentioned?',
   '[{"text":"Fuzzy dark matter","is_correct":true},{"text":"MACHOs","is_correct":false},{"text":"WIMPs","is_correct":false},{"text":"Primordial black holes","is_correct":false}]',
   'Fuzzy DM + self-interacting DM named.', 9),
  ('Q10','Why could dust obscuration cause confusion?',
   '[{"text":"Leads to overestimated luminosity and mass","is_correct":true},{"text":"Blocks all observation","is_correct":false},{"text":"Increases spectral redshift","is_correct":false},{"text":"Changes galaxy color","is_correct":false}]',
   'The article warns about mass overestimates from dust.', 10),
  ('Q11','What''s the implication for future surveys?',
   '[{"text":"May reshape Extremely Large Telescope priorities","is_correct":true},{"text":"End of optical astronomy","is_correct":false},{"text":"Shutdown of JWST","is_correct":false},{"text":"Merger of ESA and NASA","is_correct":false}]',
   'ELT time allocation may shift.', 11),
  ('Q12','How many original candidates remain unambiguously massive?',
   '[{"text":"At least three","is_correct":true},{"text":"Zero","is_correct":false},{"text":"Nine","is_correct":false},{"text":"All of them","is_correct":false}]',
   'At least three after revision.', 12)
) AS q(title, question_text, options, explanation, sort_order)
WHERE a.slug = 'test-jwst-early-galaxies';


-- ------------------------------------------------------------
-- Article 4 — Health
-- ------------------------------------------------------------
INSERT INTO articles (
  title, slug, excerpt, body, cover_image_url, cover_image_alt,
  category_id, status, visibility, is_kids_safe, language,
  reading_time_minutes, word_count, moderation_status, published_at
) VALUES (
  'Test: GLP-1 Drug Trial Shows Reduction in Cardiovascular Events',
  'test-glp1-cardiovascular-trial',
  'A large randomized trial of semaglutide in patients with established cardiovascular disease reported a 20 percent relative reduction in major adverse cardiac events.',
  'A randomized clinical trial enrolling more than 17,000 patients with established cardiovascular disease and overweight or obesity found that weekly semaglutide reduced the risk of major adverse cardiovascular events by 20 percent compared to placebo, according to results published in the New England Journal of Medicine.

The SELECT trial, sponsored by Novo Nordisk, followed patients for a median of 33 months. The primary endpoint was a composite of cardiovascular death, non-fatal myocardial infarction, or non-fatal stroke. Participants in the semaglutide arm had a 6.5 percent event rate compared to 8.0 percent in the placebo arm.

Secondary endpoints showed consistent improvements, including reductions in all-cause mortality, death from cardiovascular causes, and progression to heart failure. Weight loss in the semaglutide group averaged 9.4 percent of baseline body weight, compared to 0.9 percent in the placebo group.

The study enrolled adults 45 years of age or older with a body mass index of 27 or higher who had a history of myocardial infarction, stroke, or peripheral artery disease. Patients with diabetes were excluded from the trial, meaning the results address cardiovascular benefit in non-diabetic populations specifically — a group that had previously lacked clear evidence for GLP-1 therapy.

Adverse events occurred more often in the semaglutide group, driven primarily by gastrointestinal side effects. Nausea, diarrhea, and vomiting led to study drug discontinuation in 16.6 percent of semaglutide-treated participants compared to 8.2 percent in the placebo group. Serious adverse events were balanced between groups.

The findings are likely to accelerate policy discussions around insurance coverage for GLP-1 receptor agonists. Medicare currently does not cover semaglutide for obesity, though it does cover the drug for diabetes under the brand name Ozempic. Coverage for cardiovascular indications could follow the SELECT publication and is an active area of CMS consideration.

Critics note that the trial does not establish whether the cardiovascular benefit is a direct effect of the drug or a consequence of the substantial weight loss. A mechanistic substudy is ongoing. The drug is also expensive, listing above $1,300 per month in the United States, raising questions about cost-effectiveness even given the clinical benefit.',
  'https://picsum.photos/seed/vphealthtest1/1200/630',
  'Medication capsules on a table',
  (SELECT id FROM categories WHERE slug = 'health'),
  'published', 'public', false, 'en',
  5, 460, 'approved', now() - interval '8 hours'
) ON CONFLICT (slug) DO NOTHING;

INSERT INTO quizzes (article_id, title, question_text, options, explanation, sort_order, is_active)
SELECT a.id, q.title, q.question_text, q.options::jsonb, q.explanation, q.sort_order, true
FROM articles a, (VALUES
  ('Q1','Drug studied in the trial?',
   '[{"text":"Semaglutide","is_correct":true},{"text":"Metformin","is_correct":false},{"text":"Atorvastatin","is_correct":false},{"text":"Aspirin","is_correct":false}]',
   'Semaglutide is the GLP-1 agonist in question.', 1),
  ('Q2','How many patients enrolled?',
   '[{"text":"More than 17,000","is_correct":true},{"text":"About 1,500","is_correct":false},{"text":"Around 500","is_correct":false},{"text":"Over 100,000","is_correct":false}]',
   '17,000+ enrolled.', 2),
  ('Q3','Relative risk reduction in MACE?',
   '[{"text":"20 percent","is_correct":true},{"text":"5 percent","is_correct":false},{"text":"50 percent","is_correct":false},{"text":"75 percent","is_correct":false}]',
   '20% relative reduction vs placebo.', 3),
  ('Q4','Median follow-up length?',
   '[{"text":"33 months","is_correct":true},{"text":"6 months","is_correct":false},{"text":"10 years","is_correct":false},{"text":"5 years","is_correct":false}]',
   'Median 33 months.', 4),
  ('Q5','Which journal published the results?',
   '[{"text":"New England Journal of Medicine","is_correct":true},{"text":"JAMA","is_correct":false},{"text":"The Lancet","is_correct":false},{"text":"Nature Medicine","is_correct":false}]',
   'Published in NEJM.', 5),
  ('Q6','Minimum BMI for inclusion?',
   '[{"text":"27","is_correct":true},{"text":"30","is_correct":false},{"text":"25","is_correct":false},{"text":"35","is_correct":false}]',
   'BMI ≥27 was the cutoff.', 6),
  ('Q7','Who was excluded from the trial?',
   '[{"text":"Patients with diabetes","is_correct":true},{"text":"Women","is_correct":false},{"text":"Patients over 65","is_correct":false},{"text":"Patients with hypertension","is_correct":false}]',
   'Diabetics were excluded so the cohort is non-diabetic.', 7),
  ('Q8','Average weight loss on semaglutide?',
   '[{"text":"9.4 percent of baseline","is_correct":true},{"text":"2 percent","is_correct":false},{"text":"25 percent","is_correct":false},{"text":"No change","is_correct":false}]',
   '9.4% on semaglutide vs 0.9% placebo.', 8),
  ('Q9','Primary side effect category?',
   '[{"text":"Gastrointestinal","is_correct":true},{"text":"Cardiovascular","is_correct":false},{"text":"Neurological","is_correct":false},{"text":"Dermatological","is_correct":false}]',
   'Nausea/diarrhea/vomiting drove discontinuations.', 9),
  ('Q10','Trial sponsor?',
   '[{"text":"Novo Nordisk","is_correct":true},{"text":"Pfizer","is_correct":false},{"text":"Merck","is_correct":false},{"text":"Eli Lilly","is_correct":false}]',
   'Novo Nordisk sponsored SELECT.', 10),
  ('Q11','Approximate monthly US list price mentioned?',
   '[{"text":"Above $1,300","is_correct":true},{"text":"Under $100","is_correct":false},{"text":"$5,000","is_correct":false},{"text":"Free through Medicare","is_correct":false}]',
   'Listed above $1,300/month.', 11),
  ('Q12','Unresolved mechanistic question?',
   '[{"text":"Whether benefit is direct drug effect or from weight loss","is_correct":true},{"text":"Whether the drug exists","is_correct":false},{"text":"Whether blood pressure changes","is_correct":false},{"text":"Whether exercise was tracked","is_correct":false}]',
   'Direct vs. weight-loss-mediated is still open.', 12)
) AS q(title, question_text, options, explanation, sort_order)
WHERE a.slug = 'test-glp1-cardiovascular-trial';


-- ------------------------------------------------------------
-- Article 5 — Climate
-- ------------------------------------------------------------
INSERT INTO articles (
  title, slug, excerpt, body, cover_image_url, cover_image_alt,
  category_id, status, visibility, is_kids_safe, language,
  reading_time_minutes, word_count, moderation_status, published_at
) VALUES (
  'Test: Atlantic Meridional Overturning Circulation Weakening Faster Than Expected',
  'test-amoc-weakening',
  'New paleoclimate reconstructions and direct measurements suggest the AMOC has weakened by roughly 15 percent since 1950, with models disagreeing sharply on tipping-point proximity.',
  'A new analysis combining 150 years of paleoclimate proxies with direct oceanographic measurements indicates that the Atlantic Meridional Overturning Circulation has weakened by approximately 15 percent since 1950, and may be approaching a tipping point whose precise location remains uncertain.

The AMOC is the system of ocean currents that transports warm surface water northward from the tropics, cools and sinks in the North Atlantic, and returns as deep cold water southward. Its stability is important for European climate, West African rainfall patterns, and global heat distribution. A full collapse would have severe regional consequences, though complete shutdown is not imminent on any mainstream model.

The study, a collaboration between researchers at University College London, Potsdam Institute for Climate Impact Research, and NOAA, synthesized coral, sediment, and tree-ring records with continuous RAPID-MOCHA monitoring data since 2004. The authors estimate that the recent weakening is unprecedented over at least the last millennium.

Where models disagree most is on what comes next. The IPCC''s AR6 report projected high confidence in some weakening through 2100 but low confidence on collapse risk within the century. Several independent studies using simplified system models have since argued that a tipping point could arrive as early as the 2030s under high-emission pathways. Coupled general circulation models used in CMIP6 generally do not reproduce this behavior, which complicates interpretation.

One complication is the role of meltwater from the Greenland ice sheet. Fresh water at the surface of the North Atlantic reduces density and suppresses the sinking that drives the deep overturning circulation. Greenland mass loss has accelerated from roughly 120 gigatons per year in the early 2000s to over 280 gigatons per year recently.

Policy implications depend on tipping-point proximity. If the AMOC crosses a threshold, effects would persist for centuries regardless of subsequent emissions cuts — making the circulation a potential lock-in risk for European climate. Early warning signals, including increased variance and autocorrelation in the AMOC time series, are an active research focus. The study reports detection of some of these statistical signatures in recent decades, though the authors caution that detection does not prove imminent collapse.',
  'https://picsum.photos/seed/vpclimtest1/1200/630',
  'North Atlantic ocean from space',
  (SELECT id FROM categories WHERE slug = 'climate'),
  'published', 'public', true, 'en',
  6, 490, 'approved', now() - interval '3 days'
) ON CONFLICT (slug) DO NOTHING;

INSERT INTO quizzes (article_id, title, question_text, options, explanation, sort_order, is_active)
SELECT a.id, q.title, q.question_text, q.options::jsonb, q.explanation, q.sort_order, true
FROM articles a, (VALUES
  ('Q1','Approximate weakening since 1950?',
   '[{"text":"15 percent","is_correct":true},{"text":"2 percent","is_correct":false},{"text":"50 percent","is_correct":false},{"text":"No change","is_correct":false}]',
   'Roughly 15 percent.', 1),
  ('Q2','What does AMOC stand for?',
   '[{"text":"Atlantic Meridional Overturning Circulation","is_correct":true},{"text":"Arctic Marine Oxygen Cycle","is_correct":false},{"text":"American Monthly Oceanic Current","is_correct":false},{"text":"Antarctic Meridional Oscillation Cycle","is_correct":false}]',
   'The title spells it out.', 2),
  ('Q3','Region most affected by AMOC stability?',
   '[{"text":"European climate","is_correct":true},{"text":"South American monsoon","is_correct":false},{"text":"Australian outback","is_correct":false},{"text":"Antarctic sea ice","is_correct":false}]',
   'European climate is the prime concern.', 3),
  ('Q4','Three institutions named?',
   '[{"text":"UCL, PIK, NOAA","is_correct":true},{"text":"MIT, CERN, ESA","is_correct":false},{"text":"Harvard, Oxford, Tokyo","is_correct":false},{"text":"Stanford, Berkeley, JPL","is_correct":false}]',
   'UCL + Potsdam (PIK) + NOAA.', 4),
  ('Q5','Since when has RAPID-MOCHA provided monitoring?',
   '[{"text":"2004","is_correct":true},{"text":"1975","is_correct":false},{"text":"2020","is_correct":false},{"text":"1950","is_correct":false}]',
   'RAPID-MOCHA data since 2004.', 5),
  ('Q6','Greenland mass loss, recent annual rate?',
   '[{"text":"Over 280 Gt/year","is_correct":true},{"text":"Under 50 Gt/year","is_correct":false},{"text":"1,000 Gt/year","is_correct":false},{"text":"Net gain","is_correct":false}]',
   'Accelerated to over 280 Gt/year.', 6),
  ('Q7','IPCC AR6 position on within-century collapse?',
   '[{"text":"Low confidence","is_correct":true},{"text":"High confidence","is_correct":false},{"text":"Certain","is_correct":false},{"text":"Ruled out","is_correct":false}]',
   'AR6 low confidence on collapse.', 7),
  ('Q8','One early-warning statistical signature?',
   '[{"text":"Increased variance and autocorrelation","is_correct":true},{"text":"Decreasing mean temperature","is_correct":false},{"text":"Rising salinity","is_correct":false},{"text":"Lunar phase shifts","is_correct":false}]',
   'Increased variance + autocorrelation are canonical early-warning signs.', 8),
  ('Q9','Why does fresh surface water weaken AMOC?',
   '[{"text":"Reduces density and suppresses sinking","is_correct":true},{"text":"Evaporates faster","is_correct":false},{"text":"Freezes and stops flow","is_correct":false},{"text":"Adds mass that pushes water south","is_correct":false}]',
   'Less dense water doesn''t sink — breaks the pump.', 9),
  ('Q10','What did simplified system models argue?',
   '[{"text":"Tipping point could arrive as early as the 2030s","is_correct":true},{"text":"AMOC is stable for centuries","is_correct":false},{"text":"Collapse already happened","is_correct":false},{"text":"AMOC is strengthening","is_correct":false}]',
   '2030s under high-emission scenarios.', 10),
  ('Q11','Which models generally do not reproduce imminent tipping?',
   '[{"text":"CMIP6 coupled general circulation models","is_correct":true},{"text":"Simplified box models","is_correct":false},{"text":"Paleoclimate proxies","is_correct":false},{"text":"Satellite altimetry","is_correct":false}]',
   'CMIP6 GCMs don''t show it.', 11),
  ('Q12','Why do policy decisions hinge on tipping proximity?',
   '[{"text":"Crossing a threshold locks in centuries of change","is_correct":true},{"text":"It is the only climate metric that matters","is_correct":false},{"text":"It can be reversed with reforestation","is_correct":false},{"text":"It changes within a year","is_correct":false}]',
   'Threshold-crossing is irreversible on century timescales.', 12)
) AS q(title, question_text, options, explanation, sort_order)
WHERE a.slug = 'test-amoc-weakening';
