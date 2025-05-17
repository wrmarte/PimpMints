// ✅ FINAL FIXED MINT BOT (WITH BUFFER_OVERRUN & MEMORY PATCHES)
require('dotenv').config();
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');
const { JsonRpcProvider, Contract, ZeroAddress, id, Interface } = require('ethers');
const fetch = require('node-fetch');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const rpcUrls = [
  'https://mainnet.base.org',
  'https://developer-access-mainnet.base.org',
  'https://base.blockpi.network/v1/rpc/public'
];

let provider;
let contract;
const abi = [
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
  "function tokenURI(uint256 tokenId) view returns (string)"
];
const iface = new Interface(abi);

(async () => {
  for (const url of rpcUrls) {
    try {
      const temp = new JsonRpcProvider(url);
      await temp.getBlockNumber();
      provider = temp;
      console.log(`✅ Connected to RPC: ${url}`);
      break;
    } catch (err) {
      console.warn(`⚠️ Failed to connect to RPC: ${url}`);
    }
  }
  if (!provider) {
    console.error('❌ All RPCs failed');
    process.exit(1);
  }

  contract = new Contract(process.env.CONTRACT_ADDRESS, abi, provider);
})();

const primaryChannelId = process.env.DISCORD_CHANNEL_ID;
const extraChannelId = '1322616358944637031';
const mintPrice = 0.0069;
let lastBlockChecked = 0;

client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  while (!provider || !contract) await new Promise(res => setTimeout(res, 300));

  lastBlockChecked = await provider.getBlockNumber();

  const mainChannel = await client.channels.fetch(primaryChannelId).catch(() => null);
  const altChannel = await client.channels.fetch(extraChannelId).catch(() => null);

  if (!mainChannel) console.warn('⚠️ Could not fetch mainChannel');
  if (!altChannel) console.warn('⚠️ Could not fetch altChannel');

  provider.on('block', async (blockNumber) => {
    try {
      const toBlock = Math.min(lastBlockChecked + 10, blockNumber);

      const logs = await provider.getLogs({
        fromBlock: lastBlockChecked + 1,
        toBlock,
        address: contract.address,
        topics: [
          id("Transfer(address,address,uint256)"),
          '0x0000000000000000000000000000000000000000000000000000000000000000'
        ]
      });

      const mints = [];

      for (const log of logs) {
        let parsed;
        try {
          parsed = iface.parseLog(log);
        } catch (err) {
          console.warn(`⚠️ Could not parse log: ${err.message}`);
          continue;
        }

        const { from, to, tokenId } = parsed.args;
        if (from !== ZeroAddress) continue;

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

        let imageUrl = 'https://via.placeholder.com/400x400.png?text=NFT';
        try {
          const res = await fetch(tokenUri);
          if (res.ok && res.headers.get('content-type')?.includes('application/json')) {
            const metadata = await res.json();
            if (metadata?.image) {
              imageUrl = metadata.image.startsWith('ipfs://')
                ? metadata.image.replace('ipfs://', 'https://ipfs.io/ipfs/')
                : metadata.image;
            }
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

        const buttonUrl = mints.length === 1
          ? `https://opensea.io/assets/base/${contract.address}/${mints[0].tokenId}`
          : `https://opensea.io/assets/base/${contract.address}`;

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setLabel('🔗 View on OpenSea')
            .setStyle(ButtonStyle.Link)
            .setURL(buttonUrl)
        );

        const targets = [mainChannel, altChannel].filter(Boolean);
        for (const channel of targets) {
          await channel.send({ embeds: [embed], components: [row] });
        }
      }

      lastBlockChecked = toBlock;
    } catch (err) {
      console.error('❌ Block processing error:', err);
    }
  });
});

client.login(process.env.DISCORD_BOT_TOKEN);



