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

    for (const wallet in mints) {
      const qty = mints[wallet];
      const ethSpent = (qty * mintPrice).toFixed(4);
      const msg = `>  ✳️ **__NEW CRYPTOPIMPS MINT ON BASE!__**\n >  📇 Wallet: \`${wallet}\`\n >  🪶 Quantity: **${qty}**\n >  💰 ETH Spent: **${ethSpent} ETH**\n  `;
      await channel.send(msg);
    }

    lastBlockChecked = blockNumber;
  });
});

client.on('messageCreate', async message => {
  if (message.content === '!testmint') {
    const fakeWallet = '0xDEADBEEFDEADBEEFDEADBEEFDEADBEEFDEADBEEF';
    const fakeQty = 2;
    const fakeEth = (fakeQty * 0.0069).toFixed(4);
    const tokenId = 1234;

    const embed = new EmbedBuilder()
      .setTitle('🧪 Test Mint Triggered')
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
        .setURL(`https://opensea.io/assets/base/0xYourContractAddress/${tokenId}`)
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
