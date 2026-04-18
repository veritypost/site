// ============================================================
// Permission keys — stable IDs that must match the `permissions.key`
// column in the DB. Never rename; deprecate with is_active=false.
// Generated from the 01-Schema/reset_and_rebuild_v2.sql seeds.
// ============================================================

export const PERM = {
  // home
  HOME_SEARCH:            'home.search',
  HOME_SUBCATEGORIES:     'home.subcategories',

  // profile
  PROFILE_SETTINGS:       'profile.settings',
  PROFILE_CONTACT_US:     'profile.contact_us',
  PROFILE_HEADER_STATS:   'profile.header_stats',
  PROFILE_PROFILE_CARD:   'profile.profile_card',
  PROFILE_ACTIVITY:       'profile.activity',
  PROFILE_CATEGORIES:     'profile.categories',
  PROFILE_ACHIEVEMENTS:   'profile.achievements',
  PROFILE_MESSAGES:       'profile.messages',
  PROFILE_KIDS:           'profile.kids',
  PROFILE_EXPERT_QUEUE:   'profile.expert_queue',

  // article
  ARTICLE_VIEW:                   'article.view',
  ARTICLE_VIEW_TIMELINE:          'article.view_timeline',
  ARTICLE_TAKE_QUIZ:              'article.take_quiz',
  ARTICLE_ASK_EXPERT:             'article.ask_expert',
  ARTICLE_VIEW_OTHER_SCORES:      'article.view_other_scores',
  ARTICLE_RETAKE_QUIZ:            'article.retake_quiz',
  ARTICLE_VIEW_EXPERT_RESPONSES:  'article.view_expert_responses',

  // comments
  COMMENTS_VIEW:              'comments.view',
  COMMENTS_VIEW_USER_PROFILE: 'comments.view_user_profile',
  COMMENTS_SORT_TOP:          'comments.sort_top',
  COMMENTS_SORT_NEWEST:       'comments.sort_newest',
  COMMENTS_FILTER_EXPERT:     'comments.filter_expert',
  COMMENTS_VIEW_PINNED:       'comments.view_pinned',
  COMMENTS_EXPAND_REPLIES:    'comments.expand_replies',
  COMMENTS_VIEW_REPLY_COUNT:  'comments.view_reply_count',
  COMMENTS_VIEW_EDITED_FLAG:  'comments.view_edited_flag',
  COMMENTS_VIEW_EDIT_HISTORY: 'comments.view_edit_history',
  COMMENTS_VIEW_PERMALINK:    'comments.view_permalink',
  COMMENTS_VIEW_VOTE_COUNTS:  'comments.view_vote_counts',
  COMMENTS_POST:              'comments.post',
  COMMENTS_REPLY:             'comments.reply',
  COMMENTS_EDIT_OWN:          'comments.edit_own',
  COMMENTS_DELETE_OWN:        'comments.delete_own',
  COMMENTS_MENTION_USER:      'comments.mention_user',
  COMMENTS_UPVOTE:            'comments.upvote',
  COMMENTS_DOWNVOTE:          'comments.downvote',
  COMMENTS_REMOVE_VOTE:       'comments.remove_vote',
  COMMENTS_REPORT:            'comments.report',
  COMMENTS_BLOCK_USER:        'comments.block_user',
  COMMENTS_UNBLOCK_USER:      'comments.unblock_user',

  // leaderboard
  LEADERBOARD_VIEW:           'leaderboard.view',

  // kids (resolved only during an active kid session)
  KIDS_HOME_VIEW:                  'kids.home.view',
  KIDS_HOME_BROWSE_CATEGORIES:     'kids.home.browse_categories',
  KIDS_HOME_DAILY_LIMIT_REMAINING: 'kids.home.daily_limit_remaining',
  KIDS_ARTICLE_VIEW:               'kids.article.view',
  KIDS_ARTICLE_VIEW_TIMELINE:      'kids.article.view_timeline',
  KIDS_ARTICLE_LISTEN_TTS:         'kids.article.listen_tts',
  KIDS_QUIZ_TAKE:                  'kids.quiz.take',
  KIDS_QUIZ_RETAKE:                'kids.quiz.retake',
  KIDS_QUIZ_VIEW_HISTORY:          'kids.quiz.view_history',
  KIDS_BOOKMARKS_ADD:              'kids.bookmarks.add',
  KIDS_BOOKMARKS_VIEW:             'kids.bookmarks.view',
  KIDS_READING_LOG_VIEW:           'kids.reading_log.view',
  KIDS_STREAKS_VIEW_OWN:           'kids.streaks.view_own',
  KIDS_ACHIEVEMENTS_VIEW_OWN:      'kids.achievements.view_own',
  KIDS_LEADERBOARD_VIEW_KIDS:      'kids.leaderboard.view_kids',
  KIDS_PROFILE_VIEW_OWN:           'kids.profile.view_own',
  KIDS_PROFILE_EDIT_AVATAR:        'kids.profile.edit_avatar',
  KIDS_SHARE_ASK_PARENT:           'kids.share.ask_parent',
  KIDS_SHARE_SHARE_TO_PARENT:      'kids.share.share_to_parent',
};

// Sections map to `permissions.ui_section`. Used when calling
// get_my_capabilities(section).
export const SECTIONS = {
  HOME:        'home',
  PROFILE:     'profile',
  ARTICLE:     'article',
  COMMENTS:    'comments',
  KIDS:        'kids',
  LEADERBOARD: 'leaderboard',
};

// Lock reasons returned by the resolver. The client maps these to modals.
export const LOCK_REASON = {
  BANNED:           'banned',
  EMAIL_UNVERIFIED: 'email_unverified',
  NOT_GRANTED:      'not_granted',
  PLAN_REQUIRED:    'plan_required',
  ROLE_REQUIRED:    'role_required',
};

// Deny modes from the DB.
export const DENY_MODE = {
  LOCKED: 'locked',   // render the element, disabled, show CTA
  HIDDEN: 'hidden',   // don't render; direct URL nav → 404
};
