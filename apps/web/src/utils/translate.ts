export const channelNameMap: Record<string, string> = {
  'mock_channel_shelf_001': '货架电商渠道 001',
  'mock_channel_live_001': '直播电商渠道 001',
  'mock_channel_short_video_001': '短视频电商渠道 001',
  'mock_channel_private_001': '私域电商渠道 001',
  'mock_douyin_live_001': '抖音直播测试渠道',
  'mock_tmall_store': '天猫旗舰店测试渠道',
  'mock_red_store': '小红书种草测试渠道',
  'mock_wechat_miniprogram': '微信小程序私域测试渠道'
};

export const taxonomyMap: Record<string, string> = {
  'style.minimal': '简约通勤',
  'style.sweet': '甜美风',
  'style.luxury': '奢华风',
  'style.elegant': '优雅风',
  'style.basic': '基础百搭',
  'style.casual': '休闲风',
  'style.sporty': '运动风',
  'price.value': '性价比',
  'price.mid': '中端价格',
  'price.premium': '高端价格',
  'occasion.work': '职场工作',
  'occasion.travel': '旅行度假',
  'occasion.party': '派对聚会',
  'occasion.daily': '日常休闲',
  'demo.age_18_24': '18-24岁',
  'demo.age_25_34': '25-34岁',
  'demo.age_35_44': '35-44岁',
  'demo.age_45_plus': '45岁以上',
  'demo.female': '女性',
  'demo.male': '男性',
  'demo.city_high_tier': '高线城市',
  'demo.city_low_tier': '下沉市场',
  'channel.shelf_ecommerce': '货架电商',
  'channel.live_stream': '直播带货',
  'channel.short_video': '短视频带货',
  'channel.private_domain': '私域电商'
};

export const translateChannel = (channelId: string) => {
  return channelNameMap[channelId] || channelId;
};

export const translateTag = (tagId: string) => {
  return taxonomyMap[tagId] || tagId;
};
