require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { JsonRpcProvider, Contract, ZeroAddress, id, Interface } = require('ethers');
const fetch = require('node-fetch');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// --- Multiple RPC Fallback Logic ---
const rpcUrls = [
  'https://mainnet.base.org',
  'https://developer-access-mainnet.base.org',
  'https://base.blockpi.network/v1/rpc/public'
];

let provider;
(async () => {
  for (const url of rpcUrls) {
    try {
      const tempProvider = new JsonRpcProvider(url);
      await tempProvider.getBlockNumber();
      provider = tempProvider;
      console.log(`✅ Connected to RPC: ${url}`);
      break;
    } catch (err) {
      console.warn(`⚠️ Failed to connect to RPC: ${url}`);
    }
  }
  if (!provider) throw new Error('❌ All RPC endpoints failed to connect');
})();

const contractAddress = process.env.CONTRACT_ADDRESS;
const primaryChannelId = process.env.DISCORD_CHANNEL_ID;
const extraChannelId = '1322616358944637031';
const mintPrice = 0.0069;

const abi = [
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
  "function tokenURI(uint256 tokenId) view returns (string)"
];

const iface = new Interface(abi);
const contract = new Contract(contractAddress, abi);
let lastBlockChecked = 0;

client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  while (!provider) await new Promise(res => setTimeout(res, 500));
  contract.connect(provider);
  lastBlockChecked = await provider.getBlockNumber();

  const mainChannel = await client.channels.fetch(primaryChannelId).catch(() => null);
  const altChannel = await client.channels.fetch(extraChannelId).catch(() => null);

  if (!mainChannel) console.warn('⚠️ Could not fetch mainChannel');
  if (!altChannel) console.warn('⚠️ Could not fetch altChannel');

  provider.on('block', async (blockNumber) => {
    const logs = await provider.getLogs({
      fromBlock: lastBlockChecked + 1,
      toBlock: blockNumber,
      address: contractAddress,
      topics: [id("Transfer(address,address,uint256)")]
    });

    const mints = [];
    for (const log of logs) {
      const parsed = iface.parseLog(log);
      const { from, to, tokenId } = parsed.args;
      if (from !== ZeroAddress) continue;

      let tokenUri;
      try {
        tokenUri = await contract.connect(provider).tokenURI(tokenId);
        if (tokenUri.startsWith('ipfs://')) {
          tokenUri = tokenUri.replace('ipfs://', 'https://ipfs.io/ipfs/');
        }
      } catch (err) {
        console.warn(`⚠️ Could not get tokenURI for tokenId ${tokenId}:`, err);
        continue;
      }

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

      mints.push({ to, tokenId, imageUrl });
    }

    if (mints.length > 0) {
      const tokenIds = mints.map(m => `#${m.tokenId}`).join(', ');

      const embed = new EmbedBuilder()
        .setTitle('✨ NEW CRYPTOPIMPS MINTS ON BASE!')
        .setDescription(`Minted by: \`${mints[0].to}\``)
        .addFields(
          { name: '🆔 Token IDs', value: tokenIds, inline: false },
          { name: '💰 ETH Spent', value: `${(mintPrice * mints.length).toFixed(4)} ETH`, inline: true },
          { name: '🔢 Total Minted', value: `${mints.length}`, inline: true }
        )
        .setThumbnail(mints[0].imageUrl)
        .setColor(219139)
        .setFooter({ text: 'Mint(s) detected live on Base' })
        .setTimestamp();

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel('🔗 View Collection on OpenSea')
          .setStyle(ButtonStyle.Link)
          .setURL(`https://opensea.io/assets/base/${contractAddress}`)
      );

      try {
        const sentIds = new Set();
        if (mainChannel && !sentIds.has(mainChannel.id)) {
          await mainChannel.send({ embeds: [embed], components: [row] });
          sentIds.add(mainChannel.id);
        }
        if (altChannel && !sentIds.has(altChannel.id)) {
          await altChannel.send({ embeds: [embed], components: [row] });
          sentIds.add(altChannel.id);
        }
      } catch (err) {
        console.error('❌ Failed to send embed:', err);
      }
    }

    lastBlockChecked = blockNumber;
  });
});

client.on('messageCreate', async message => {
  if (message.content === '!mintest') {
    const fakeWallet = '0xDEADBEEFDEADBEEFDEADBEEFDEADBEEFDEADBEEF';
    const tokenIds = [1210, 1211, 1212];
    const fakeQty = tokenIds.length;

    const embed = new EmbedBuilder()
      .setTitle('🧪 Simulated Mint')
      .setDescription(`Simulated mint by: \`${fakeWallet}\``)
      .addFields(
        { name: '🆔 Token IDs', value: tokenIds.map(id => `#${id}`).join(', '), inline: false },
        { name: '💰 ETH Spent', value: `${(mintPrice * fakeQty).toFixed(4)} ETH`, inline: true },
        { name: '🔢 Total Minted', value: `${fakeQty}`, inline: true }
      )
      .setThumbnail('https://via.placeholder.com/400x400.png?text=NFT+Preview')
      .setColor(0x3498db)
      .setFooter({ text: 'Simulation Mode • Not Real' })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel('🔗 View Collection on OpenSea')
        .setStyle(ButtonStyle.Link)
        .setURL(`https://opensea.io/assets/base/${contractAddress}`)
    );

    try {
      await message.channel.send({ embeds: [embed], components: [row] });
      await message.reply(':point_up: Simulated embed sent!');
    } catch (err) {
      console.error('❌ Failed to send embed:', err);
      await message.reply('⚠️ Failed to send message — check logs.');
    }
  }
});

client.login(process.env.DISCORD_BOT_TOKEN);

