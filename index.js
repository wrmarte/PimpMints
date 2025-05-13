// enhanced-mint-bot.js
require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { JsonRpcProvider, Contract, ZeroAddress, id, Interface } = require('ethers');
const fetch = require('node-fetch');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const provider = new JsonRpcProvider(process.env.RPC_URL);
const contractAddress = process.env.CONTRACT_ADDRESS;
const channelId = process.env.DISCORD_CHANNEL_ID;
const mintPrice = 0.0069;

const abi = [
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
  "function tokenURI(uint256 tokenId) view returns (string)"
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

    for (const log of logs) {
      const parsed = iface.parseLog(log);
      const { from, to, tokenId } = parsed.args;

      if (from !== ZeroAddress) continue;

      let tokenUri;
      try {
        tokenUri = await contract.tokenURI(tokenId);
        if (tokenUri.startsWith('ipfs://')) {
          tokenUri = tokenUri.replace('ipfs://', 'https://ipfs.io/ipfs/');
        }
      } catch (err) {
        console.warn(`⚠️ tokenURI fail for token ${tokenId}:`, err);
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
        console.warn(`⚠️ metadata fetch fail for token ${tokenId}:`, err);
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
        .setColor(0xD62C2C)
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
  if (message.content === '!mintest') {
    const tokenId = 1210;
    const embed = new EmbedBuilder()
      .setTitle('🧪 Test Mint Triggered')
      .setDescription('Simulated mint on Base network.')
      .addFields(
        { name: '📇 Wallet', value: '`0xDEADBEEFDEADBEEFDEADBEEFDEADBEEFDEADBEEF`' },
        { name: '🪶 Quantity', value: '2', inline: true },
        { name: '💰 ETH Spent', value: `${(2 * mintPrice).toFixed(4)} ETH`, inline: true },
        { name: '🆔 Token ID', value: `#${tokenId}`, inline: true }
      )
      .setColor(0x3498db)
      .setImage('https://via.placeholder.com/300x300.png?text=Mint+Test')
      .setFooter({ text: 'Simulation Mode • Not Real' })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel('🔗 View on OpenSea')
        .setStyle(ButtonStyle.Link)
        .setURL(`https://opensea.io/assets/base/${contractAddress}/${tokenId}`)
    );

    try {
      const channel = await client.channels.fetch(channelId);
      await channel.send({ embeds: [embed], components: [row] });
      await message.reply(':point_up: Test embed sent.');
    } catch (err) {
      console.error('❌ Failed to send test embed:', err);
      await message.reply('⚠️ Failed to send test embed.');
    }
  }
});

client.login(process.env.DISCORD_BOT_TOKEN);

