import plugin from '../plugin.json';

import { Configuration, OpenAIApi } from 'openai';

const SideButton = acode.require('sideButton');
const prompt = acode.require('prompt');
const multiPrompt = acode.require('multiPrompt');
const selectionMenu = acode.require('selectionMenu');

class GenerateCode {
  
  async init() {
    
    this.$markdownItFile = tag("script", {
      src: this.baseUrl + "assets/markdown-it.min.js"
    });

    this.$pencilIcon = tag('img', {
      className: 'edit-text-generate-token',
      src: this.baseUrl + 'assets/pencil-icon.svg'
    })
    
    document.head.append(this.$markdownItFile);

    // Command
    editorManager.editor.commands.addCommand({
      name: 'generate_code',
      description: 'Generate Code',
      exec: this.run.bind(this),
    });

    editorManager.editor.commands.addCommand({
      name: 'hide_generate_code_btn',
      description: 'Hide the generate code button',
      exec: () => this.sideButton.hide()
    });
    
    editorManager.editor.commands.addCommand({
      name: 'show_generate_code_btn',
      description: 'Show the generate code button',
      exec: () => this.sideButton.show()
    });

    editorManager.editor.commands.addCommand({
      name: 'generate_code_update_token',
      description: 'Update Openai Token (Generate Code)',
      exec: this.updateToken.bind(this),
    });

    this.sideButton = SideButton({
      text: 'Generate Code',
      icon: 'generate-code-icon',
      onclick: () => this.run(),
      backgroundColor: '#8400ff',
      textColor: '#000'
    });

    this.sideButton.show();
    selectionMenu.add(this.run.bind(this), this.$pencilIcon, 'all');
  }

  async run() {
    const { editor } = editorManager;
    let selectedText = editor.session.getTextRange(editor.getSelectionRange());

    let token;
    const openaiToken = window.localStorage.getItem('generate-code-token');
    if (openaiToken) {
      token = openaiToken;
    } else {
      let tokenPrompt = await multiPrompt(
        'Enter your openai api key',
        [{
          type: 'text',
          id: 'aicode-token',
          required: true,
          placeholder: 'Enter your openai api key'
        }],
        'https://platform.openai.com/api-keys'
      )
      token = tokenPrompt['aicode-token'];
      window.localStorage.setItem('generate-code-token', token);
    }

    const openai = new OpenAIApi(new Configuration({ apiKey: token}))
    let mdIt = window.markdownit({
      html: false,
      xhtmlOut: false,
      breaks: false,
      linkify: false,
      typographer: false,
      quotes: '“”‘’',
      highlight: function (str) {editorManager.editor.insert(str)}
    });

    const options = {placeholder: selectedText ? 'Enter a command to generate new code...' : 'Enter a command to generate code...'}
    const userPrompt = await prompt(selectedText ? 'Generate New Code' : 'Generate Code', '', 'text', options);
    const message = selectedText ? `${userPrompt}
    
${selectedText}` : userPrompt;

    const res = await openai.createChatCompletion({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: 'You are ChatGPT, a large language model trained by OpenAI.'},
        { role: 'user', content: message}
      ],
      temperature: 0
    })
    
    let result = res.data.choices[0].message.content;
    mdIt.render(result);
  }

  async updateToken() {
    let newToken = await multiPrompt(
      'Enter your openai api key',
      [{
        type: 'text',
        id: 'aicode-token',
        required: true,
        placeholder: 'Enter your openai api key'
      }],
      'https://platform.openai.com/api-keys'
      )

    window.localStorage.removeItem('generate-code-token');
    window.localStorage.setItem('generate-code-token', newToken['aicode-token']);
    window.toast('Api Key Update!', 3000);
  }

  async destroy() {
    editorManager.editor.commands.removeCommand('generate_code');
    editorManager.editor.commands.removeCommand('generate_code_update_token');
    editorManager.editor.commands.removeCommand('hide_generate_code_btn');
    editorManager.editor.commands.removeCommand('show_generate_code_btn');
    window.localStorage.removeItem('generate-code-token');
    this.$markdownItFile.remove();
    this.$pencilIcon.remove();
  }

}

if (window.acode) {
  const acodePlugin = new GenerateCode();
  acode.setPluginInit(
    plugin.id,
    (baseUrl, $page, { cacheFileUrl, cacheFile }) => {
      if (!baseUrl.endsWith("/")) {
        baseUrl += "/";
      }
      acodePlugin.baseUrl = baseUrl;
      acodePlugin.init($page, cacheFile, cacheFileUrl);
    }
  );
  acode.setPluginUnmount(plugin.id, () => {
    acodePlugin.destroy();
  });
}