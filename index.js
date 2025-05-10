require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const { JsonRpcProvider, Contract, ZeroAddress, id, Interface } = require('ethers');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');


const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const provider = new JsonRpcProvider(process.env.RPC_URL);
const contractAddress = process.env.CONTRACT_ADDRESS;
const channelId = process.env.DISCORD_CHANNEL_ID;
const mintPrice = 0.0069;

const abi = [
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)"
];
const iface = new Interface(abi);
const contract = new Contract(contractAddress, abi, provider);

let lastBlockChecked = 0;

client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  lastBlockChecked = await provider.getBlockNumber();
  const channel = await client.channels.fetch(channelId);

  provider.on('block', async (blockNumber) => {
    const logs = await provider.getLogs({
      fromBlock: lastBlockChecked + 1,
      toBlock: blockNumber,
      address: contractAddress,
      topics: [id("Transfer(address,address,uint256)")]
    });

    const mints = {};

    for (const log of logs) {
      const parsed = iface.parseLog(log);
      const to = parsed.args.to;
      const from = parsed.args.from;

      if (from !== ZeroAddress) continue;

      if (!mints[to]) mints[to] = 0;
      mints[to]++;
    }

for (const log of logs) {
  const parsed = iface.parseLog(log);
  const to = parsed.args.to;
  const from = parsed.args.from;
  const tokenId = parsed.args.tokenId;

  if (from !== ZeroAddress) continue;

  // Try to get token URI
  let tokenUri;
  try {
    tokenUri = await contract.tokenURI(tokenId);
    if (tokenUri.startsWith('ipfs://')) {
      tokenUri = tokenUri.replace('ipfs://', 'https://ipfs.io/ipfs/');
    }
  } catch (err) {
    console.warn(`⚠️ Could not get tokenURI for tokenId ${tokenId}:`, err);
    continue;
  }

  // Fetch metadata
  let imageUrl = 'https://via.placeholder.com/400x400.png?text=NFT';
  try {
    const metadata = await fetch(tokenUri).then(res => res.json());
    if (metadata?.image) {
      imageUrl = metadata.image.startsWith('ipfs://')
        ? metadata.image.replace('ipfs://', 'https://ipfs.io/ipfs/')
        : metadata.image;
    }
  } catch (err) {
    console.warn(`⚠️ Could not fetch metadata for tokenId ${tokenId}:`, err);
  }

  const embed = new EmbedBuilder()
    .setTitle('✨ NEW CRYPTOPIMPS MINT ON BASE!')
    .setDescription('A new NFT has just been minted.')
    .addFields(
      { name: '📇 Wallet', value: `\`${to}\``, inline: false },
      { name: '🆔 Token ID', value: `#${tokenId}`, inline: true },
      { name: '💰 ETH Spent', value: `${mintPrice} ETH`, inline: true }
    )
    .setImage(imageUrl)
    .setColor(0x0099ff)
    .setFooter({ text: 'Mint detected live on Base' })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel('🔗 View on OpenSea')
      .setStyle(ButtonStyle.Link)
      .setURL(`https://opensea.io/assets/base/${contractAddress}/${tokenId}`)
  );

  try {
    await channel.send({ embeds: [embed], components: [row] });
  } catch (err) {
    console.error('❌ Failed to send embed:', err);
  }
}


    lastBlockChecked = blockNumber;
  });
});

client.on('messageCreate', async message => {
  if (message.content === '!testmint') {
    const fakeWallet = '0xDEADBEEFDEADBEEFDEADBEEFDEADBEEFDEADBEEF';
    const fakeQty = 1;
    const fakeEth = (fakeQty * 0.0069).toFixed(4);
    const tokenId = 1200;

    const embed = new EmbedBuilder()
      .setTitle('🧪 **__Test Mint Triggered__**')
      .setDescription('Simulated mint on Base network.')
      .addFields(
        { name: '📇 Wallet', value: `\`${fakeWallet}\`` },
        { name: '🪶 Quantity', value: `${fakeQty}`, inline: true },
        { name: '💰 ETH Spent', value: `${fakeEth} ETH`, inline: true },
        { name: '🆔 Token ID', value: `#${tokenId}`, inline: true }
      )
      .setColor(0x3498db)
      .setImage('https://via.placeholder.com/400x400.png?text=NFT+Preview')
      .setFooter({ text: 'Simulation Mode • Not Real' })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel('🔗 View on OpenSea')
        .setStyle(ButtonStyle.Link)
        .setURL(`https://opensea.io/assets/base/0xC38E2Ae060440c9269CcEB8C0EA8019a66Ce8927/${tokenId}`)
    );

    try {
      const channel = await client.channels.fetch(process.env.DISCORD_CHANNEL_ID);
      await channel.send({ embeds: [embed], components: [row] });
      await message.reply(':point_up: Embed sent!');
    } catch (err) {
      console.error('❌ Failed to send embed:', err);
      await message.reply('⚠️ Failed to send message — check logs.');
    }
  }
});


client.login(process.env.DISCORD_BOT_TOKEN);
