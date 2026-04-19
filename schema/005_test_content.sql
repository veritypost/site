-- ============================================================
-- Test Content: Kid Profiles + Sample Articles
-- Run in Supabase SQL Editor (bypasses RLS)
-- ============================================================

-- Kid profiles for test_family
INSERT INTO "kid_profiles" ("parent_user_id", "display_name", "avatar_color", "date_of_birth") VALUES
  ('6043adab-d354-4ba6-91ee-036c0167e495', 'Emma', '#10b981', '2016-03-15'),
  ('6043adab-d354-4ba6-91ee-036c0167e495', 'Liam', '#3b82f6', '2018-07-22');

-- Sample articles across categories
INSERT INTO "articles" ("title", "slug", "excerpt", "body", "body_html", "category_id", "author_id", "status", "visibility", "is_ai_generated", "is_kids_safe", "kids_summary", "published_at", "moderation_status", "reading_time_minutes", "word_count") VALUES

-- Politics
('Supreme Court to Hear Major Social Media Case This Term',
 'supreme-court-social-media-case',
 'The Supreme Court has agreed to take up a landmark case that could reshape how social media companies moderate content.',
 'The Supreme Court has agreed to take up a landmark case that could reshape how social media companies moderate content.

The case, which originated from a challenge by several state attorneys general, asks whether platforms have a First Amendment right to set their own content moderation policies, or whether states can compel them to host certain types of speech.

Legal experts say the ruling could have far-reaching implications for how Americans interact with technology platforms that have become central to public discourse. The court is expected to hear oral arguments early next year.

"This is potentially the most significant First Amendment case in a generation," said one constitutional law professor. "The outcome will define the relationship between government, platforms, and individual speech for decades to come."',
 '<p>The Supreme Court has agreed to take up a landmark case that could reshape how social media companies moderate content.</p><p>The case, which originated from a challenge by several state attorneys general, asks whether platforms have a First Amendment right to set their own content moderation policies, or whether states can compel them to host certain types of speech.</p><p>Legal experts say the ruling could have far-reaching implications for how Americans interact with technology platforms that have become central to public discourse. The court is expected to hear oral arguments early next year.</p>',
 'db49c4b0-0522-469a-8c8c-45607ce4c1c6', 'e411d105-786c-4ad1-936a-47f203bf277d',
 'published', 'public', false, false, NULL,
 now() - interval '2 hours', 'approved', 4, 850),

-- World
('Global Trade Tensions Rise as New Tariffs Take Effect',
 'global-trade-tensions-tariffs',
 'A new round of tariffs between major economies is creating uncertainty for businesses and consumers worldwide.',
 'A new round of tariffs between major economies is creating uncertainty for businesses and consumers worldwide.

The latest escalation comes as negotiations between the world''s two largest economies have stalled over key issues including intellectual property protections and market access. Economists warn that prolonged trade disputes could slow global growth.

Industries from agriculture to manufacturing are already feeling the effects, with supply chain disruptions and rising input costs squeezing profit margins. Several multinational corporations have announced plans to diversify their supply chains in response.

International trade organizations are calling for renewed dialogue, warning that a fragmented global trading system would harm developing nations the most.',
 '<p>A new round of tariffs between major economies is creating uncertainty for businesses and consumers worldwide.</p><p>The latest escalation comes as negotiations between the world''s two largest economies have stalled over key issues including intellectual property protections and market access.</p><p>Industries from agriculture to manufacturing are already feeling the effects, with supply chain disruptions and rising input costs squeezing profit margins.</p>',
 '9bba7135-0eab-4a6a-84b0-eafb5edc42f2', 'e411d105-786c-4ad1-936a-47f203bf277d',
 'published', 'public', false, false, NULL,
 now() - interval '5 hours', 'approved', 5, 920),

-- Technology
('Tech Giants Report Record AI Infrastructure Spending',
 'tech-giants-ai-infrastructure-spending',
 'The largest technology companies are pouring billions into AI data centers and chip development.',
 'The largest technology companies are pouring billions into AI data centers and chip development, with combined capital expenditure on AI infrastructure expected to exceed $200 billion this year.

The spending spree reflects a belief among tech leaders that artificial intelligence will fundamentally transform every industry. Companies are racing to secure GPU capacity, build specialized data centers, and develop custom silicon.

This massive investment has created a boom for semiconductor manufacturers and construction firms specializing in data center builds. However, some analysts question whether the returns will justify the enormous upfront costs.

Energy consumption is emerging as a key concern, with some AI data centers requiring as much electricity as small cities.',
 '<p>The largest technology companies are pouring billions into AI data centers and chip development.</p><p>The spending spree reflects a belief among tech leaders that artificial intelligence will fundamentally transform every industry.</p><p>This massive investment has created a boom for semiconductor manufacturers and construction firms. However, some analysts question whether the returns will justify the enormous costs.</p>',
 'f6fa2b9e-229e-48e6-a3d6-fe4f2eace6c6', 'e411d105-786c-4ad1-936a-47f203bf277d',
 'published', 'public', false, false, NULL,
 now() - interval '1 day', 'approved', 6, 1100),

-- Health
('New Study Links Sleep Quality to Long-Term Heart Health',
 'sleep-quality-heart-health-study',
 'Researchers have found a strong correlation between consistent sleep patterns and cardiovascular outcomes over a 20-year period.',
 'Researchers have found a strong correlation between consistent sleep patterns and cardiovascular outcomes over a 20-year period.

The study, published in a leading medical journal, tracked over 15,000 participants and found that those who maintained regular sleep schedules had a 29% lower risk of heart disease compared to those with irregular patterns.

Importantly, the research suggests that sleep consistency may be even more important than total sleep duration. Participants who went to bed and woke up at roughly the same time each day showed the best outcomes, regardless of whether they slept six or eight hours.',
 '<p>Researchers have found a strong correlation between consistent sleep patterns and cardiovascular outcomes over a 20-year period.</p><p>The study tracked over 15,000 participants and found that those who maintained regular sleep schedules had a 29% lower risk of heart disease.</p>',
 'dbaddb8e-106e-4a3f-b0d0-bdb895712272', 'e411d105-786c-4ad1-936a-47f203bf277d',
 'published', 'public', false, false, NULL,
 now() - interval '8 hours', 'approved', 3, 680),

-- Science
('NASA Confirms New Exoplanet in Habitable Zone',
 'nasa-exoplanet-habitable-zone',
 'A newly discovered planet orbiting a nearby star falls within the region where liquid water could exist on its surface.',
 'A newly discovered planet orbiting a nearby star falls within the region where liquid water could exist on its surface.

The exoplanet, designated TOI-4633 b, was detected using the James Webb Space Telescope and confirmed through ground-based observations. It orbits a sun-like star approximately 40 light-years from Earth.

Scientists are particularly excited because the planet appears to have an atmosphere, which JWST will be able to analyze for signs of water vapor, carbon dioxide, and potentially biosignatures.

While the discovery does not confirm the existence of life, it represents the closest and most promising habitable-zone planet found to date.',
 '<p>A newly discovered planet orbiting a nearby star falls within the region where liquid water could exist on its surface.</p><p>The exoplanet was detected using the James Webb Space Telescope. Scientists are excited because the planet appears to have an atmosphere.</p>',
 '840f5eb4-2600-4a12-80b6-d20267dcdea9', 'e411d105-786c-4ad1-936a-47f203bf277d',
 'published', 'public', false, true, 'Scientists found a new planet that might have water on it!',
 now() - interval '3 hours', 'approved', 4, 780),

-- Business
('Stock Markets Rally on Strong Employment Data',
 'stock-markets-rally-employment',
 'Major indices surged after the latest jobs report exceeded analyst expectations.',
 'Major indices surged after the latest jobs report exceeded analyst expectations, with the economy adding 280,000 jobs in the most recent month.

The S&P 500 rose 1.8%, while the Nasdaq gained 2.3%. The strong employment numbers eased fears of an economic slowdown and boosted confidence in corporate earnings projections.

However, some economists cautioned that the robust job market could delay interest rate cuts, as the Federal Reserve continues to monitor inflation closely.',
 '<p>Major indices surged after the latest jobs report exceeded analyst expectations.</p><p>The S&P 500 rose 1.8%, while the Nasdaq gained 2.3%.</p>',
 'ca87311a-e930-441b-b95f-79e7df26be0b', 'e411d105-786c-4ad1-936a-47f203bf277d',
 'published', 'public', false, false, NULL,
 now() - interval '12 hours', 'approved', 3, 520),

-- Sports
('NFL Draft: Five Surprises from the First Round',
 'nfl-draft-first-round-surprises',
 'Several unexpected picks shook up team strategies and draft boards across the league.',
 'Several unexpected picks shook up team strategies and draft boards across the league during a dramatic first round of the NFL Draft.

The biggest shock came when the third overall pick went to a defensive tackle, a position that rarely goes that high. Multiple trades reshuffled the order, and two quarterbacks selected in the top ten were considered second-round prospects just weeks ago.

Teams that traded up paid steep prices in future draft capital, while those that traded down accumulated assets for upcoming years.',
 '<p>Several unexpected picks shook up team strategies and draft boards across the league.</p><p>The biggest shock came when the third overall pick went to a defensive tackle. Multiple trades reshuffled the order.</p>',
 '3f2b027b-e2be-41ed-8d71-93282dfb5d4d', 'e411d105-786c-4ad1-936a-47f203bf277d',
 'published', 'public', false, true, NULL,
 now() - interval '6 hours', 'approved', 4, 650),

-- Entertainment
('Streaming Wars Intensify as Services Bundle Together',
 'streaming-wars-bundling',
 'Major streaming platforms are partnering to offer joint subscriptions at a discount.',
 'Major streaming platforms are partnering to offer joint subscriptions at a discount, marking a significant shift in the streaming industry''s competitive dynamics.

The new bundles combine multiple services for roughly 40% less than subscribing individually. Analysts say the move acknowledges that consumers are suffering from subscription fatigue and cutting back on individual services.

The bundling trend could reshape how content is produced and distributed, as platforms seek to differentiate themselves while sharing subscriber bases.',
 '<p>Major streaming platforms are partnering to offer joint subscriptions at a discount.</p><p>The bundles combine multiple services for roughly 40% less than subscribing individually.</p>',
 '54835446-a534-4c42-a684-018525e8c720', 'e411d105-786c-4ad1-936a-47f203bf277d',
 'published', 'public', false, false, NULL,
 now() - interval '1 day 4 hours', 'approved', 3, 540),

-- Economy
('Federal Reserve Signals Caution on Rate Cuts',
 'federal-reserve-rate-cuts-caution',
 'The central bank indicated it would take a patient approach to lowering interest rates.',
 'The central bank indicated it would take a patient approach to lowering interest rates, pushing back against market expectations for aggressive easing this year.

In its latest policy statement, the Federal Reserve acknowledged that inflation has come down significantly but noted that the last mile toward the 2% target remains challenging.

Markets adjusted their expectations following the announcement, with Treasury yields rising and rate-sensitive sectors like real estate and utilities declining.',
 '<p>The central bank indicated it would take a patient approach to lowering interest rates.</p><p>In its latest statement, the Fed acknowledged inflation progress but noted the last mile toward 2% remains challenging.</p>',
 'ca4bd860-a0fa-4ab9-a94a-6a8953c604d0', 'e411d105-786c-4ad1-936a-47f203bf277d',
 'published', 'public', false, false, NULL,
 now() - interval '4 hours', 'approved', 4, 620),

-- Climate
('Arctic Ice Reaches Record Low for April',
 'arctic-ice-record-low-april',
 'Satellite data shows Arctic sea ice extent has hit its lowest level ever recorded for the month of April.',
 'Satellite data shows Arctic sea ice extent has hit its lowest level ever recorded for the month of April, continuing a decades-long trend of declining polar ice.

The National Snow and Ice Data Center reported that April ice coverage was 8% below the previous record set in 2019. Scientists attributed the decline to warming ocean temperatures and shifting atmospheric patterns.

The loss of Arctic ice has cascading effects on global weather systems, sea levels, and ecosystems that depend on polar habitats.',
 '<p>Satellite data shows Arctic sea ice extent has hit its lowest level ever recorded for April.</p><p>April ice coverage was 8% below the previous record set in 2019.</p>',
 'e2a54332-8b8a-4015-9119-7ca520756a8f', 'e411d105-786c-4ad1-936a-47f203bf277d',
 'published', 'public', false, true, 'The ice at the North Pole is melting faster than ever before.',
 now() - interval '10 hours', 'approved', 3, 480),

-- Technology (2nd)
('New Cybersecurity Framework Proposed for Critical Infrastructure',
 'cybersecurity-framework-critical-infrastructure',
 'Federal agencies have drafted updated guidelines for protecting power grids, water systems, and transportation networks.',
 'Federal agencies have drafted updated guidelines for protecting power grids, water systems, and transportation networks from cyber threats.

The new framework requires critical infrastructure operators to implement zero-trust architecture, conduct regular penetration testing, and establish incident response plans within 90 days.

Industry groups have expressed mixed reactions, with some praising the standardized approach while others worry about compliance costs for smaller operators.',
 '<p>Federal agencies have drafted updated guidelines for protecting critical infrastructure from cyber threats.</p><p>The framework requires zero-trust architecture and regular penetration testing.</p>',
 'f6fa2b9e-229e-48e6-a3d6-fe4f2eace6c6', 'e411d105-786c-4ad1-936a-47f203bf277d',
 'published', 'public', false, false, NULL,
 now() - interval '2 days', 'approved', 5, 780),

-- Education
('School Choice Legislation Advances in Three States',
 'school-choice-legislation-states',
 'Three state legislatures are moving forward with bills that would expand voucher programs for private school tuition.',
 'Three state legislatures are moving forward with bills that would expand voucher programs for private school tuition, reigniting a national debate about education funding.

Supporters argue the programs give families more options, while opponents worry about diverting resources from public schools that serve the majority of students.

The bills vary in scope but share a common structure: state funds follow students to whichever school their parents choose, including private and religious institutions.',
 '<p>Three state legislatures are moving forward with bills expanding voucher programs.</p><p>Supporters argue the programs give families more options, while opponents worry about diverting public school resources.</p>',
 'd9d20c0e-c0d4-46eb-99b2-5c525e458a4b', 'e411d105-786c-4ad1-936a-47f203bf277d',
 'published', 'public', false, true, NULL,
 now() - interval '1 day 8 hours', 'approved', 4, 580),

-- Kids Science
('Scientists Discover New Species in Deep Ocean Trench',
 'new-species-deep-ocean-trench',
 'An expedition to one of the deepest parts of the ocean has found creatures never before seen by scientists.',
 'An expedition to one of the deepest parts of the ocean has found creatures never before seen by scientists.

Using a specially designed submarine that can withstand extreme pressure, researchers explored a trench nearly 8 kilometers below the surface. They discovered three new species of fish and several new types of tiny organisms called amphipods.

The creatures have adapted to survive in complete darkness, freezing temperatures, and crushing pressure. Scientists say understanding how they survive could help us learn more about life in extreme environments, including potentially on other planets.',
 '<p>An expedition to one of the deepest parts of the ocean has found creatures never before seen by scientists.</p><p>Researchers explored a trench nearly 8 kilometers below the surface and discovered three new species of fish.</p>',
 '840f5eb4-2600-4a12-80b6-d20267dcdea9', 'e411d105-786c-4ad1-936a-47f203bf277d',
 'published', 'public', false, true, 'Scientists found three new types of fish living at the bottom of the ocean where it is very dark and cold!',
 now() - interval '14 hours', 'approved', 3, 420),

-- Kids Tech
('Young Inventor Creates Solar-Powered Water Purifier',
 'young-inventor-solar-water-purifier',
 'A 12-year-old has designed a device that uses sunlight to clean dirty water, winning a national science competition.',
 'A 12-year-old from California has designed a device that uses sunlight to clean dirty water, winning first place at a national science competition.

The device works by using a solar panel to power a small pump that pushes water through a filter and UV light system. It can purify about 5 liters of water per hour and costs less than $50 to build.

The young inventor says she was inspired after learning that millions of people around the world lack access to clean drinking water. She plans to publish her designs online so anyone can build one.',
 '<p>A 12-year-old has designed a device that uses sunlight to clean dirty water.</p><p>The device can purify about 5 liters of water per hour and costs less than $50 to build.</p>',
 'aaaca0c0-6f2d-4ca9-807c-ee0b34d9f91e', 'e411d105-786c-4ad1-936a-47f203bf277d',
 'published', 'public', false, true, 'A kid invented a machine that cleans dirty water using the sun!',
 now() - interval '18 hours', 'approved', 2, 350),

-- Kids Sports
('Olympics Committee Announces New Youth Sports Events',
 'olympics-new-youth-events',
 'The next Olympic Games will feature three new events designed specifically for young athletes.',
 'The next Olympic Games will feature three new events designed specifically for young athletes, the International Olympic Committee announced today.

The new events include a mixed relay swimming race, a team climbing competition, and a breakdancing battle format. All three were chosen because of their popularity among younger audiences.

Athletes between ages 15 and 18 will be eligible to compete. The IOC says the additions are part of an effort to make the Olympics more relevant to the next generation of sports fans.',
 '<p>The next Olympic Games will feature three new events designed for young athletes.</p><p>The new events include mixed relay swimming, team climbing, and breakdancing.</p>',
 '911be8d6-bdbe-49d5-a431-1d1c149a7097', 'e411d105-786c-4ad1-936a-47f203bf277d',
 'published', 'public', false, true, 'The Olympics is adding three new sports that kids and teenagers can compete in!',
 now() - interval '22 hours', 'approved', 2, 380);
